package main

import (
	"fmt"
	"sync"
	"time"
)

// ScheduledTask describes a recurring task run by the Scheduler.
type ScheduledTask struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Type        string        `json:"type"`        // "command", "webhook", "llm"
	Payload     string        `json:"payload"`     // shell command, URL, or prompt
	Interval    time.Duration `json:"-"`
	IntervalStr string        `json:"interval"`    // "30s", "5m", "1h"
	Enabled     bool          `json:"enabled"`
	LastRun     int64         `json:"lastRun"`     // Unix milliseconds
	RunCount    int           `json:"runCount"`
}

const minInterval = 10 * time.Second

// Scheduler runs enabled tasks at their configured intervals.
type Scheduler struct {
	mu     sync.RWMutex
	tasks  map[string]*ScheduledTask
	stopCh chan struct{}
	logger *Logger
	onExec func(task *ScheduledTask)
}

// NewScheduler creates a Scheduler backed by the given logger.
func NewScheduler(logger *Logger) *Scheduler {
	return &Scheduler{
		tasks:  make(map[string]*ScheduledTask),
		stopCh: make(chan struct{}),
		logger: logger,
	}
}

// SetExecutor sets the callback invoked when a task fires.
func (s *Scheduler) SetExecutor(fn func(*ScheduledTask)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onExec = fn
}

// Add registers a new task. IntervalStr is parsed into Interval; minimum 10s.
func (s *Scheduler) Add(task ScheduledTask) error {
	if task.ID == "" {
		return fmt.Errorf("scheduler: task ID must not be empty")
	}
	d, err := time.ParseDuration(task.IntervalStr)
	if err != nil {
		return fmt.Errorf("scheduler: invalid interval %q: %w", task.IntervalStr, err)
	}
	if d < minInterval {
		return fmt.Errorf("scheduler: interval %v is below minimum %v", d, minInterval)
	}
	task.Interval = d

	s.mu.Lock()
	defer s.mu.Unlock()
	s.tasks[task.ID] = &task
	s.logger.Info("scheduler: task added", "id", task.ID, "name", task.Name, "interval", task.IntervalStr)
	return nil
}

// Remove deletes a task by ID. Returns true if the task existed.
func (s *Scheduler) Remove(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.tasks[id]
	if ok {
		delete(s.tasks, id)
		s.logger.Info("scheduler: task removed", "id", id)
	}
	return ok
}

// List returns a snapshot of all registered tasks.
func (s *Scheduler) List() []ScheduledTask {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]ScheduledTask, 0, len(s.tasks))
	for _, t := range s.tasks {
		out = append(out, *t)
	}
	return out
}

// Start launches the scheduler loop in a background goroutine.
func (s *Scheduler) Start() {
	s.logger.Info("scheduler: starting")
	go s.loop()
}

// Stop signals the scheduler loop to exit.
func (s *Scheduler) Stop() {
	s.logger.Info("scheduler: stopping")
	close(s.stopCh)
}

func (s *Scheduler) loop() {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-s.stopCh:
			return
		case <-ticker.C:
			s.tick()
		}
	}
}

func (s *Scheduler) tick() {
	now := time.Now().UnixMilli()

	s.mu.Lock()
	var due []*ScheduledTask
	for _, t := range s.tasks {
		if !t.Enabled {
			continue
		}
		intervalMs := t.Interval.Milliseconds()
		if now-t.LastRun >= intervalMs {
			t.LastRun = now
			t.RunCount++
			// copy for goroutine — avoids holding the lock during execution
			cp := *t
			due = append(due, &cp)
		}
	}
	s.mu.Unlock()

	exec := s.onExec
	if exec == nil {
		return
	}
	for _, t := range due {
		task := t
		s.logger.Debug("scheduler: firing task", "id", task.ID, "name", task.Name, "runCount", task.RunCount)
		go exec(task)
	}
}

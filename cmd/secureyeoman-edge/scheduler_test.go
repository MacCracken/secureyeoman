package main

import (
	"sync/atomic"
	"testing"
	"time"
)

func newTestScheduler() *Scheduler {
	return NewScheduler(NewLogger("error"))
}

func TestSchedulerAddAndList(t *testing.T) {
	s := newTestScheduler()

	task := ScheduledTask{
		ID:          "task-1",
		Name:        "Test Task",
		Type:        "command",
		Payload:     "uname",
		IntervalStr: "30s",
		Enabled:     true,
	}
	if err := s.Add(task); err != nil {
		t.Fatalf("expected Add to succeed, got: %v", err)
	}

	tasks := s.List()
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task in list, got %d", len(tasks))
	}
	if tasks[0].ID != "task-1" {
		t.Errorf("expected task ID 'task-1', got %q", tasks[0].ID)
	}
}

func TestSchedulerRemove(t *testing.T) {
	s := newTestScheduler()

	task := ScheduledTask{
		ID:          "task-remove",
		Name:        "Removable Task",
		Type:        "command",
		Payload:     "hostname",
		IntervalStr: "30s",
		Enabled:     true,
	}
	if err := s.Add(task); err != nil {
		t.Fatalf("Add failed: %v", err)
	}

	removed := s.Remove("task-remove")
	if !removed {
		t.Fatal("expected Remove to return true for existing task")
	}

	tasks := s.List()
	if len(tasks) != 0 {
		t.Fatalf("expected empty list after removal, got %d tasks", len(tasks))
	}

	// Removing again should return false.
	if s.Remove("task-remove") {
		t.Error("expected Remove to return false for already-removed task")
	}
}

func TestSchedulerMinInterval(t *testing.T) {
	s := newTestScheduler()

	task := ScheduledTask{
		ID:          "task-short",
		Name:        "Too Frequent",
		Type:        "command",
		Payload:     "date",
		IntervalStr: "5s",
		Enabled:     true,
	}
	err := s.Add(task)
	if err == nil {
		t.Fatal("expected error for interval below minimum (10s), got nil")
	}
}

func TestSchedulerExecution(t *testing.T) {
	s := newTestScheduler()

	var callCount int64
	fired := make(chan struct{}, 1)

	s.SetExecutor(func(task *ScheduledTask) {
		if atomic.AddInt64(&callCount, 1) == 1 {
			fired <- struct{}{}
		}
	})

	task := ScheduledTask{
		ID:          "task-exec",
		Name:        "Exec Task",
		Type:        "command",
		Payload:     "uname",
		IntervalStr: "10s",
		Enabled:     true,
	}
	if err := s.Add(task); err != nil {
		t.Fatalf("Add failed: %v", err)
	}

	s.Start()
	defer s.Stop()

	select {
	case <-fired:
		// Success — executor was called.
	case <-time.After(11 * time.Second):
		t.Fatal("timed out waiting for scheduler to fire task within 11s")
	}

	if atomic.LoadInt64(&callCount) < 1 {
		t.Error("expected executor to be called at least once")
	}
}

func TestSchedulerDuplicateID(t *testing.T) {
	s := newTestScheduler()

	first := ScheduledTask{
		ID:          "dup-id",
		Name:        "First",
		Type:        "command",
		Payload:     "uname",
		IntervalStr: "30s",
		Enabled:     true,
	}
	second := ScheduledTask{
		ID:          "dup-id",
		Name:        "Second",
		Type:        "command",
		Payload:     "hostname",
		IntervalStr: "1m",
		Enabled:     true,
	}

	if err := s.Add(first); err != nil {
		t.Fatalf("first Add failed: %v", err)
	}
	if err := s.Add(second); err != nil {
		t.Fatalf("second Add (duplicate ID) should succeed (overwrite), got: %v", err)
	}

	tasks := s.List()
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task after duplicate add, got %d", len(tasks))
	}
	// Should reflect the second (overwritten) task.
	if tasks[0].Name != "Second" {
		t.Errorf("expected overwritten task name 'Second', got %q", tasks[0].Name)
	}
}

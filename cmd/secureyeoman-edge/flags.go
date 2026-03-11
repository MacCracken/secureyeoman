package main

import (
	"fmt"
	"os"
	"strconv"
)

// StartConfig holds parsed flags for the "start" command.
type StartConfig struct {
	Port      int
	Host      string
	LogLevel  string
	ParentURL string
}

// parseStartFlags parses CLI flags for "secureyeoman-edge start".
func parseStartFlags(args []string) StartConfig {
	cfg := StartConfig{
		Port:     envInt("SECUREYEOMAN_EDGE_PORT", 18891),
		Host:     "0.0.0.0",
		LogLevel: "info",
	}

	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "-p", "--port":
			if i+1 < len(args) {
				i++
				if v, err := strconv.Atoi(args[i]); err == nil {
					cfg.Port = v
				} else {
					fmt.Fprintf(os.Stderr, "Invalid port: %s\n", args[i])
					os.Exit(1)
				}
			}
		case "-H", "--host":
			if i+1 < len(args) {
				i++
				cfg.Host = args[i]
			}
		case "-l", "--log-level":
			if i+1 < len(args) {
				i++
				cfg.LogLevel = args[i]
			}
		case "--parent":
			if i+1 < len(args) {
				i++
				cfg.ParentURL = args[i]
			}
		default:
			fmt.Fprintf(os.Stderr, "Unknown flag: %s\n", args[i])
			os.Exit(1)
		}
	}

	return cfg
}

// parseRegisterFlags parses CLI flags for "secureyeoman-edge register".
func parseRegisterFlags(args []string) (parentURL, token string) {
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--parent":
			if i+1 < len(args) {
				i++
				parentURL = args[i]
			}
		case "--token":
			if i+1 < len(args) {
				i++
				token = args[i]
			}
		default:
			fmt.Fprintf(os.Stderr, "Unknown flag: %s\n", args[i])
			os.Exit(1)
		}
	}
	return
}

func envInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

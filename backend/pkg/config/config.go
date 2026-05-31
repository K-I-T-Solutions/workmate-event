package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server ServerConfig `yaml:"server"`
	DB     DBConfig     `yaml:"db"`
	OBS    OBSConfig    `yaml:"obs"`
	SumUp  SumUpConfig  `yaml:"sumup"`
	TSE    TSEConfig    `yaml:"tse"`
	Users  []UserConfig `yaml:"users"`
}


type ServerConfig struct {
	Port      int    `yaml:"port"`
	JWTSecret string `yaml:"jwt_secret"`
	PublicURL string `yaml:"public_url"` // z.B. https://workmate-event.kit-it-koblenz.de
}

type DBConfig struct {
	Path string `yaml:"path"`
}

type OBSConfig struct {
	URL      string `yaml:"url"`
	Password string `yaml:"password"`
}

type SumUpConfig struct {
	APIKey        string `yaml:"api_key"`
	WebhookSecret string `yaml:"webhook_secret"`
}

type TSEConfig struct {
	Device string `yaml:"device"` // z.B. /dev/sdb1
	Mock   bool   `yaml:"mock"`   // true = Mock-TSE für Entwicklung
}

type UserConfig struct {
	Username     string `yaml:"username"`
	PasswordHash string `yaml:"password_hash"`
	Role         string `yaml:"role"`
}

func Load(path string) (*Config, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var cfg Config
	if err := yaml.NewDecoder(f).Decode(&cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

-- create-schemas.sql

CREATE DATABASE IF NOT EXISTS demo;

GRANT ALL PRIVILEGES ON demo.* TO 'homepage'@'%';
FLUSH PRIVILEGES;
#!/bin/bash

echo "Destroying old lab instances..."
sudo containerlab destroy -t topology.lab.yml --cleanup

echo "Deploying network topology..."
sudo containerlab deploy -t topology.lab.yml

echo "Waiting for Database..."
until sudo docker exec clab-cyberlab-database pg_isready -U admin -d cyber_audit > /dev/null 2>&1; do
  echo "   (Database is booting... waiting 2 seconds)"
  sleep 2
done
echo "Database is up!"

echo "Starting Firewall & Router traffic..."
sudo docker exec -d clab-cyberlab-firewall sh -c 'while true; do ping -c 1 172.20.20.101 > /dev/null; sleep 15; done'
sudo docker exec -d clab-cyberlab-router sh -c 'while true; do ping -c 1 172.20.20.100 > /dev/null; sleep 15; done'

echo "Setting up database mock credentials schema..."
sudo docker exec -i clab-cyberlab-database psql -U admin -d cyber_audit -c "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username VARCHAR(50), email VARCHAR(100), api_key VARCHAR(100)); INSERT INTO users (username, email, api_key) VALUES ('johndoe', 'john.doe@company.com', 'xoxb-1234567890-abcdef'), ('janedoe', 'jane.doe@company.com', 'Bearer_sk_live_987654') ON CONFLICT DO NOTHING;"

echo "Starting Webserver & Database backend loops..."
sudo docker exec -d clab-cyberlab-webserver sh -c 'apk add --no-cache postgresql-client && while true; do PGPASSWORD=SecretPassword123 psql -h 172.20.20.103 -U admin -d cyber_audit -c "SELECT 1;" > /dev/null 2>&1; sleep 12; done'

echo "Spooling Windows client identity and user browsing simulator..."
sudo docker exec -d clab-cyberlab-win-emu-client sh -c 'echo "WIN-CLIENT-PC" > /etc/hostname && apt-get update && apt-get install -y samba smbclient wsdd winbind curl && service smbd start && service nmbd start && service wsdd start && while true; do curl -s http://172.20.20.104 > /dev/null; nc -z 172.20.20.105 445 > /dev/null 2>&1; sleep 10; done'

echo "All simulated traffic streams active!"

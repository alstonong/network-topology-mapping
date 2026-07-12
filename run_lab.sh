#!/bin/bash

# Start Lab
echo "Starting deployment..."
sudo containerlab destroy --topo topology.lab.yml --cleanup
sudo containerlab deploy --topo topology.lab.yml

sleep 2

echo "Configuring switches..."
for sw in switch-a switch-b; do
    docker exec clab-homelab-$sw brctl addbr br0
    docker exec clab-homelab-$sw ip link set br0 up
    docker exec clab-homelab-$sw ip link set eth1 master br0
    docker exec clab-homelab-$sw ip link set eth2 master br0
    docker exec clab-homelab-$sw ip link set eth3 master br0
    docker exec clab-homelab-$sw ip link set eth4 master br0
    docker exec clab-homelab-$sw ip link set eth5 master br0
    docker exec clab-homelab-$sw ip link set eth6 master br0
done
docker exec clab-homelab-switch-b ip link set eth7 master br0

# Setup Gateway/Firewall
echo "Configuring firewall and routing..."
docker exec clab-homelab-firewall ip addr add 10.0.0.1/30 dev eth1
docker exec clab-homelab-firewall ip addr add 10.0.0.5/30 dev eth2
docker exec clab-homelab-firewall sysctl -w net.ipv4.ip_forward=1

docker exec clab-homelab-firewall ip route add 192.168.10.0/24 via 10.0.0.2
docker exec clab-homelab-firewall ip route add 192.168.20.0/24 via 10.0.0.6

# Setup Routers
docker exec clab-homelab-router-a ip addr add 10.0.0.2/30 dev eth1
docker exec clab-homelab-router-a ip addr add 192.168.10.1/24 dev eth2
docker exec clab-homelab-router-a ip route replace default via 10.0.0.1 dev eth1
docker exec clab-homelab-router-a sysctl -w net.ipv4.ip_forward=1

docker exec clab-homelab-router-b ip addr add 10.0.0.6/30 dev eth1
docker exec clab-homelab-router-b ip addr add 192.168.20.1/24 dev eth2
docker exec clab-homelab-router-b ip route replace default via 10.0.0.5 dev eth1
docker exec clab-homelab-router-b sysctl -w net.ipv4.ip_forward=1

# Helper function to assign IPs to clients
assign_ip() {
    docker exec clab-homelab-$1 ip addr add $2/24 dev eth1
    docker exec clab-homelab-$1 ip route replace default via $3 dev eth1
}

# Assign Subnet A
echo "Assigning IPs to Subnet A..."
assign_ip linux-a1 192.168.10.10 192.168.10.1
assign_ip linux-a2 192.168.10.11 192.168.10.1
assign_ip win-a1 192.168.10.12 192.168.10.1
assign_ip win-a2 192.168.10.13 192.168.10.1
assign_ip web-server-a 192.168.10.20 192.168.10.1

# Assign Subnet B
echo "Assigning IPs to Subnet B..."
assign_ip linux-b1 192.168.20.10 192.168.20.1
assign_ip linux-b2 192.168.20.11 192.168.20.1
assign_ip win-b1 192.168.20.12 192.168.20.1
assign_ip win-b2 192.168.20.13 192.168.20.1
assign_ip file-server-b 192.168.20.20 192.168.20.1
assign_ip db-server 192.168.20.21 192.168.20.1

echo "Starting simulated services..."

# Linux Clients: Start SSH (Port 22)
for node in linux-a1 linux-a2 linux-b1 linux-b2; do
    docker exec clab-homelab-$node ssh-keygen -A > /dev/null 2>&1
    docker exec -d clab-homelab-$node /usr/sbin/sshd
done

# Windows Clients: Start SMB (139/445) and fake RDP (3389)
for node in win-a1 win-a2 win-b1 win-b2; do
    docker exec clab-homelab-$node sh -c "echo '[global]' > /etc/samba/smb.conf"
    docker exec -d clab-homelab-$node smbd -D
    docker exec -d clab-homelab-$node socat TCP4-LISTEN:3389,fork,reuseaddr /dev/null
done

# File Server: Start FTP (21) and SMB (139/445)
docker exec clab-homelab-file-server-b sh -c "echo '[global]' > /etc/samba/smb.conf"
docker exec -d clab-homelab-file-server-b smbd -D
docker exec -d clab-homelab-file-server-b vsftpd

# Start LLDP 
echo "Starting LLDP daemon on all devices..."
ALL_NODES="firewall router-a router-b switch-a switch-b linux-a1 linux-a2 win-a1 win-a2 web-server-a linux-b1 linux-b2 win-b1 win-b2 file-server-b db-server"
for node in $ALL_NODES; do
    docker exec -d clab-homelab-$node lldpd
done

echo "Lab deployment complete."
sleep 5 
echo "Ready!"

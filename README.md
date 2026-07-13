# Network Topology Mapping

## Tools used
* **containerlabs** to simulate network enviornment
* **n8n** to automate workflow
* arp
* nmap
* lldpd

## n8n Workflow Configuration

### Workflow Steps
| Step | Action | Command/Script |
| :--- | :--- | :--- |
| 1 | Subnet Scan A | `docker exec clab-homelab-linux-a1 sh -c "arp-scan 192.168.10.0/24 && nmap -sn -n -T5 --min-rate 1000 192.168.11.0/24"` |
| 2 | Process A | `step2and5script.js` |
| 3 | Port Scan A | `docker exec clab-homelab-linux-a1 nmap -sS -T4 --max-retries 1 -p 21,22,53,80,139,443,445,5432 {{ $json.targetIPs }}` |
| 4 | Subnet Scan B | `docker exec clab-homelab-linux-b1 sh -c "arp-scan 192.168.20.0/24 && nmap -sn -n -T5 --min-rate 1000 192.168.21.0/24"` |
| 5 | Process B | `step2and5script.js` |
| 6 | Port Scan B | `docker exec clab-homelab-linux-b1 nmap -sS -T4 --max-retries 1 -p 21,22,53,80,139,443,445,5432 {{ $json.targetIPs }}` |
| 7 | Collect Topology | `docker exec clab-homelab-router-a sh -c "ip -j addr && echo '---L2---' && lldpcli -f json show neighbors" && echo "---ROUTER_SPLIT---" && docker exec clab-homelab-router-b sh -c "ip -j addr && echo '---L2---' && lldpcli -f json show neighbors"` |
| 8 | Generate HTML | `step8script.js` |
| 9 | Deploy Report | `mkdir -p /path/to/desired/folder`<br>`cat << 'EOF' > /path/to/desired/folder/topology.html`<br>`{{ $json.generated_html }}`<br>`EOF` |

## Resources
* https://www.computerweekly.com/de/ratgeber/Netzwerkstruktur-kartieren-mit-arp-scan-lldpd-und-yersini

# Step 2 and Step 5 JS scripts

const rawArp = $input.first().json.stdout || "";

const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
let ips = [];
const matches = rawArp.match(ipRegex);

if (matches) {
    ips = [...new Set(matches)].filter(ip => {
        return !ip.endsWith('.0') && !ip.endsWith('.255') && ip.startsWith('192.168.');
    });
}

// If no IPs are found, we provide a fallback (e.g., scanning the local interface) so Nmap doesn't fail
let targetIPs = ips.length > 0 ? ips.join(' ') : "127.0.0.1";

return [{ 
    json: { 
        targetIPs: targetIPs 
    } 
}];
const rawSubnetA = $items("Scan Subnet A")[0].json.stdout || "";
const rawSubnetB = $items("Scan Subnet B")[0].json.stdout || "";
const rawRouterData = $items("LLDP Discovery")[0].json.stdout || "";

let visNodes = [];
let visEdges = [];
let seenNodes = new Set();
let seenSubnets = new Set();

let prefixToSwitchMap = {}; 

function addNode(id, label, shape, color) {
    if (!seenNodes.has(id)) {
        visNodes.push({ id: id, label: label, shape: shape, color: color, font: { multi: 'html' } });
        seenNodes.add(id);
    }
}
function addEdge(from, to, dashes = false) {
    const edgeId = `${from}-${to}`;
    const reverseEdgeId = `${to}-${from}`;
    if (!seenNodes.has(edgeId) && !seenNodes.has(reverseEdgeId)) {
        visEdges.push({ from: from, to: to, dashes: dashes });
        seenNodes.add(edgeId);
    }
}

// ==========================================
// PHASE 1: OSI LAYER 2 & 3 CORRELATION
// ==========================================
function parseRouterData(rawData, routerId) {
    if (!rawData) return;
    const parts = rawData.split('---L2---');
    if (parts.length !== 2) return;
    
    const ipDataRaw = parts[0].trim();
    const lldpDataRaw = parts[1].trim();
    
    let ifaceToPrefix = {}; 
    let routerIps = []; 
    
    try {
        const ipData = JSON.parse(ipDataRaw);
        ipData.forEach(iface => {
            const ifName = iface.ifname;
            if (iface.addr_info) {
                iface.addr_info.forEach(addr => {
                    if (addr.family === 'inet' && addr.local !== '127.0.0.1') {
                        const ip = addr.local;
                        routerIps.push(ip); 
                        const prefix = ip.substring(0, ip.lastIndexOf('.'));
                        ifaceToPrefix[ifName] = prefix;
                    }
                });
            }
        });
    } catch (e) { console.error("IP JSON Parse Error", e); }
    
    let routerLabel = `<b>${routerId.toUpperCase()}</b>`;
    if (routerIps.length > 0) {
        // Format IPs nicely, e.g., 10.0.0.2, 192.168.10.1
        routerLabel += `\nIPs: ${routerIps.join(', ')}`; 
    }
    addNode(routerId, routerLabel, 'box', '#4da6ff');

    try {
        const lldpData = JSON.parse(lldpDataRaw);
        const interfaces = lldpData.lldp.interface;
        
        let ifaces = Array.isArray(interfaces) ? interfaces : Object.values(interfaces);
        
        ifaces.forEach(iface => {
            for (let portName in iface) { 
                let neighborName = Object.keys(iface[portName].chassis)[0];
                let cleanName = neighborName.replace('clab-homelab-', ''); 
                
                let shape = 'triangle'; 
                let color = '#ffcc00'; 
                let label = `<b>Physical Switch</b>\n${cleanName}`;

                if (cleanName.includes('firewall')) {
                    shape = 'diamond';
                    color = '#ff4d4d';
                    label = `<b>Core Firewall</b>\n${cleanName}`;
                }

                addNode(cleanName, label, shape, color);
                addEdge(routerId, cleanName); 
                
                if (shape === 'triangle' && ifaceToPrefix[portName]) {
                    prefixToSwitchMap[ifaceToPrefix[portName]] = cleanName;
                }
            }
        });
    } catch (e) { console.error("LLDP JSON Parse Error", e); }
}

if (rawRouterData) {
    const routers = rawRouterData.split('---ROUTER_SPLIT---');
    if (routers[0]) parseRouterData(routers[0], 'router-a');
    if (routers[1]) parseRouterData(routers[1], 'router-b');
}

// ==========================================
// PHASE 2: DEVICE FINGERPRINTING & PLACEMENT (Nmap)
// ==========================================
function parseDynamicNmap(rawText, anchorRouter) {
    if (!rawText) return;
    const lines = rawText.split('\n');
    
    let currentIp = '';
    let currentPorts = [];
    let currentMac = '';

    function commitDevice() {
        if (currentIp) {
            let subnetPrefix = currentIp.substring(0, currentIp.lastIndexOf('.'));
            let parentNode = prefixToSwitchMap[subnetPrefix];
            
            if (!parentNode) {
                parentNode = 'logical-' + subnetPrefix;
                if (!seenSubnets.has(subnetPrefix)) {
                    seenSubnets.add(subnetPrefix);
                    addNode(parentNode, `<b>Logical Subnet</b>\n${subnetPrefix}.x`, 'cloud', '#ffffff');
                    addEdge(anchorRouter, parentNode, true);
                }
            }

            // Ignore gateways so we don't draw the router twice
            if (currentIp.endsWith('.1') || currentIp.endsWith('.254')) return; 

            let deviceType = "Unknown Host";
            let shape = 'dot';
            let color = '#a6a6a6'; 
            const portStr = currentPorts.join(' ');

            if (portStr.includes('21/tcp')) {
                deviceType = "Dedicated File Server";
                color = '#FF9800'; 
                shape = 'database'; 
            } else if (portStr.includes('5432/tcp')) {
                deviceType = "Database (PostgreSQL)";
                color = '#336791'; 
                shape = 'database';
            } else if (portStr.includes('80/tcp') || portStr.includes('443/tcp')) {
                deviceType = "Web Server";
                color = '#4CAF50'; 
                shape = 'hexagon';
            } else if (portStr.includes('445/tcp') || portStr.includes('139/tcp')) {
                deviceType = "Windows Host / SMB";
                color = '#0078D7'; 
                shape = 'square';
            } else if (portStr.includes('22/tcp')) {
                deviceType = "Linux Host (SSH)";
                color = '#E95420'; 
            }

            let label = `<b>${deviceType}</b>\nIP: ${currentIp}`;
            if (currentMac) label += `\nMAC: ${currentMac}`;
            currentPorts.forEach(p => { label += `\n ↳ ${p}`; });

            addNode(currentIp, label, shape, color);
            addEdge(parentNode, currentIp); 
        }
    }

    lines.forEach(line => {
        if (line.includes('Nmap scan report for')) {
            commitDevice();
            currentIp = line.split('for ')[1].trim();
            currentPorts = [];
            currentMac = '';
        } else if (line.startsWith('MAC Address:')) {
            currentMac = line.split('(')[0].replace('MAC Address:', '').trim();
        } else if (line.includes('/tcp') && line.includes('open')) {
            currentPorts.push(line.trim().replace(/\s+/g, ' '));
        }
    });
    commitDevice(); 
}

parseDynamicNmap(rawSubnetA, 'router-a');
parseDynamicNmap(rawSubnetB, 'router-b');

// ==========================================
// PHASE 3: HTML COMPILATION
// ==========================================
const networkDataString = JSON.stringify({ nodes: visNodes, edges: visEdges }, null, 2);

const htmlFileContent = `<!DOCTYPE html>
<html>
<head>
    <title>Autonomous Enterprise Topology</title>
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <style>
        body { font-family: sans-serif; background-color: #1e1e1e; color: white; text-align: center; margin: 0; padding: 20px; }
        #mynetwork { width: 100%; height: 85vh; border: 2px solid #4da6ff; background-color: #2b2b2b; border-radius: 10px; margin-top: 10px; }
    </style>
</head>
<body>
    <h2>Autonomous Enterprise Topology (Fully Correlated L2/L3)</h2>
    <p>Last scanned: ${new Date().toLocaleString()}</p>
    <div id="mynetwork"></div>

    <script type="text/javascript">
        const networkData = ${networkDataString};
        
        const container = document.getElementById('mynetwork');
        const options = {
            nodes: { font: { color: '#ffffff', multi: 'html', size: 14, align: 'left' }, margin: 10 },
            edges: { color: { color: '#888888', highlight: '#ffffff' }, width: 2, smooth: { type: 'continuous' } },
            physics: {
                solver: 'forceAtlas2Based',
                forceAtlas2Based: { gravitationalConstant: -100, centralGravity: 0.005, springLength: 230, springConstant: 0.18 },
                maxVelocity: 50,
                timestep: 0.35,
                stabilization: { iterations: 150 }
            }
        };

        const network = new vis.Network(container, networkData, options);
        network.on("stabilizationIterationsDone", function () {
            network.setOptions( { physics: false } );
        });
    </script>
</body>
</html>`;

return [{
    json: {
        generated_html: htmlFileContent
    }
}];
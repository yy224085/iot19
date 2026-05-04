/**
 * RO SMART MONITORING SYSTEM
 * SCADA Logic & MQTT Client Connection
 */

// --- CONFIGURATION ---
const MQTT_CONFIG = {
    // Modify this URI to point to your Mosquitto broker IP if running on a different machine
    uri: 'ws://localhost:9001', 
    options: {
        username: 'user1',
        password: '1234',
        reconnectPeriod: 5000,
        connectTimeout: 30000,
    }
};

const TOPICS = {
    sub_data: 'ro/data',
    sub_alert: 'ro/alert',
    sub_status: 'ro/status',
    pub_control: 'ro/control'
};

// Global Chart Instance
let scadaChart;

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initChart();
    setupMQTT();
    addLog('System initialized. Awaiting network connection...', 'info');
});

// --- CLOCK LOGIC ---
function initClock() {
    const clockEl = document.getElementById('live-clock');
    setInterval(() => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString('en-GB', { hour12: false });
    }, 1000);
}

// --- MQTT CLIENT LOGIC ---
let client;

function setupMQTT() {
    addLog(`Attempting connection to broker at ${MQTT_CONFIG.uri}...`, 'info');
    
    // Connect using MQTT.js
    client = mqtt.connect(MQTT_CONFIG.uri, MQTT_CONFIG.options);

    client.on('connect', () => {
        setIndicator('mqtt-led', 'green');
        addLog('MQTT Broker connected successfully.', 'success');
        
        // Subscribe to topics
        client.subscribe([TOPICS.sub_data, TOPICS.sub_alert, TOPICS.sub_status], (err) => {
            if (!err) {
                addLog('Subscribed to RO telemetry topics.', 'success');
            } else {
                addLog(`Subscription error: ${err.message}`, 'error');
            }
        });
    });

    client.on('reconnect', () => {
        setIndicator('mqtt-led', 'yellow');
        addLog('Reconnecting to MQTT broker...', 'warn');
    });

    client.on('offline', () => {
        setIndicator('mqtt-led', 'red');
        setIndicator('esp-led', 'red'); // Assume ESP offline if broker is unreachable
        addLog('MQTT Client offline.', 'error');
        setFlowState(false);
    });

    client.on('error', (err) => {
        addLog(`MQTT Error: ${err.message}`, 'error');
    });

    client.on('message', (topic, message) => {
        const payloadStr = message.toString();
        try {
            if (topic === TOPICS.sub_data) {
                const data = JSON.parse(payloadStr);
                handleTelemetryData(data);
                // If we get data, the ESP32 is online
                setIndicator('esp-led', 'green'); 
            } 
            else if (topic === TOPICS.sub_alert) {
                const alert = JSON.parse(payloadStr); // Expecting { message: "msg", severity: "error|warn|info" }
                handleAlert(alert.message, alert.severity);
            }
            else if (topic === TOPICS.sub_status) {
                const status = JSON.parse(payloadStr);
                setIndicator('esp-led', status.online ? 'green' : 'red');
                if(!status.online) setFlowState(false);
            }
        } catch (e) {
            addLog(`JSON Parse Error on topic ${topic}`, 'error');
        }
    });
}

// --- DATA HANDLING & UI UPDATE ---
function handleTelemetryData(data) {
    // 1. Update Sensor Values
    document.getElementById('val-tds').textContent = data.tds.toFixed(1);
    document.getElementById('val-ph').textContent = data.ph.toFixed(1);
    document.getElementById('val-turbidity').textContent = data.turbidity.toFixed(2);
    document.getElementById('val-pressure').textContent = data.pressure.toFixed(1);

    // 2. Update Status Badges
    const pumpValEl = document.getElementById('val-pump');
    if(data.pump) {
        pumpValEl.textContent = 'ON';
        pumpValEl.className = 'badge badge-green';
    } else {
        pumpValEl.textContent = 'OFF';
        pumpValEl.className = 'badge badge-red';
    }

    const modeValEl = document.getElementById('val-mode');
    modeValEl.textContent = data.autoMode ? 'AUTO' : 'MANUAL';
    modeValEl.className = data.autoMode ? 'badge badge-green' : 'badge badge-secondary';

    // 3. Update Pipeline Diagram
    setFlowState(data.pump);
    document.getElementById('node-sand').textContent = data.sandFilter + '%';
    document.getElementById('node-carbon1').textContent = data.carbon1 + '%';
    document.getElementById('node-cartridge').textContent = data.cartridge + '%';
    document.getElementById('node-ro').textContent = data.roMembrane + '%';
    document.getElementById('node-calcite').textContent = data.calcite + '%';
    document.getElementById('node-carbon2').textContent = data.carbon2 + '%';

    // 4. Update Tanks
    updateTank('r1', data.r1);
    updateTank('r2', data.r2);
    updateTank('r3', data.r3);
    updateTank('r4', data.r4);

    // 5. Update Chart
    updateChart(data.tds, data.pressure, data.ph);
}

function updateTank(id, value) {
    const safeVal = Math.min(Math.max(value, 0), 100);
    document.getElementById(`tank-${id}`).style.height = safeVal + '%';
    document.getElementById(`val-${id}`).textContent = safeVal;
}

function setFlowState(isActive) {
    const flows = document.querySelectorAll('.flow');
    flows.forEach(flow => {
        if(isActive) flow.classList.add('active');
        else flow.classList.remove('active');
    });
}

function setIndicator(id, color) {
    const el = document.getElementById(id);
    el.className = `led led-${color}`;
}

// --- PUBLISH COMMANDS ---
function publishCommand(cmd) {
    if(!client || !client.connected) {
        showToast('Error: MQTT not connected', 'error');
        return;
    }
    
    const payload = JSON.stringify({ command: cmd, timestamp: new Date().toISOString() });
    client.publish(TOPICS.pub_control, payload, { qos: 1 }, (err) => {
        if(err) {
            addLog(`Failed to send command ${cmd}`, 'error');
            showToast('Failed to send command', 'error');
        } else {
            addLog(`CMD Sent: ${cmd}`, 'info');
            showToast(`Command sent: ${cmd}`, 'info');
        }
    });
}

// --- ALERTS & LOGGING ---
function handleAlert(message, severity) {
    showToast(message, severity);
    
    // Add to alert history panel
    const container = document.getElementById('alert-container');
    const entry = document.createElement('div');
    entry.className = 'alert-entry';
    
    let colorHex = '#e2e8f0';
    if(severity === 'error') colorHex = 'var(--red)';
    if(severity === 'warn') colorHex = 'var(--yellow)';
    
    entry.style.borderLeftColor = colorHex;
    entry.innerHTML = `<span class="log-time">[${new Date().toLocaleTimeString('en-GB')}]</span> <span style="color:${colorHex}">${message}</span>`;
    
    container.prepend(entry);
    if(container.children.length > 50) container.removeChild(container.lastChild);
}

function addLog(message, type = 'info') {
    const container = document.getElementById('logs-container');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    
    let color = 'var(--text-secondary)';
    if(type === 'error') color = 'var(--red)';
    if(type === 'success') color = 'var(--green)';
    if(type === 'warn') color = 'var(--yellow)';
    
    entry.innerHTML = `<span class="log-time">[${new Date().toLocaleTimeString('en-GB')}]</span> <span style="color: ${color}">${message}</span>`;
    container.prepend(entry);
    if(container.children.length > 100) container.removeChild(container.lastChild);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse forwards';
        setTimeout(() => container.removeChild(toast), 300);
    }, 4000);
}

// --- CHART.JS CONFIGURATION ---
function initChart() {
    const ctx = document.getElementById('scadaChart').getContext('2d');
    
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Segoe UI', sans-serif";

    scadaChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], // Time labels
            datasets: [
                {
                    label: 'TDS (ppm)',
                    data: [],
                    borderColor: '#00d2ff',
                    backgroundColor: 'rgba(0, 210, 255, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'Pressure (Bar)',
                    data: [],
                    borderColor: '#ffc107',
                    borderWidth: 2,
                    tension: 0.4,
                    yAxisID: 'y1'
                },
                {
                    label: 'pH',
                    data: [],
                    borderColor: '#00ff88',
                    borderWidth: 2,
                    tension: 0.4,
                    yAxisID: 'y1' // Map to same axis as pressure for scale reasons, or create y2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 }, // Disable animation for instant SCADA feel
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'TDS (ppm)' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'Press. / pH' },
                    grid: { drawOnChartArea: false }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12 } }
            }
        }
    });
}

function updateChart(tds, pressure, ph) {
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' });
    
    const data = scadaChart.data;
    data.labels.push(timeStr);
    data.datasets[0].data.push(tds);
    data.datasets[1].data.push(pressure);
    data.datasets[2].data.push(ph);

    // Keep only last 30 values
    if (data.labels.length > 30) {
        data.labels.shift();
        data.datasets[0].data.shift();
        data.datasets[1].data.shift();
        data.datasets[2].data.shift();
    }

    scadaChart.update();
}
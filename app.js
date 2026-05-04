/**
 * RO SMART MONITORING SYSTEM
 * HiveMQ Cloud Version
 */

/* ================= MQTT CONFIG ================= */

const MQTT_CONFIG = {
    uri: "wss://broker.hivemq.com:8884/mqtt",
    options: {
        reconnectPeriod: 3000,
        connectTimeout: 30000
    }
};

/* ================= TOPICS ================= */

const TOPICS = {
    sub_data: "yasserdz/ro/data",
    sub_alert: "yasserdz/ro/alert",
    sub_status: "yasserdz/ro/status",
    pub_control: "yasserdz/ro/control"
};

/* ================= GLOBALS ================= */

let client;
let scadaChart;

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded", () => {
    initClock();
    initChart();
    setupMQTT();
    addLog("System initialized", "success");
});

/* ================= CLOCK ================= */

function initClock() {
    const clockEl = document.getElementById("live-clock");

    setInterval(() => {
        const now = new Date();
        clockEl.textContent = now.toLocaleTimeString();
    }, 1000);
}

/* ================= MQTT ================= */

function setupMQTT() {

    addLog("Connecting to HiveMQ...", "info");

    client = mqtt.connect(MQTT_CONFIG.uri, MQTT_CONFIG.options);

    client.on("connect", () => {

        setIndicator("mqtt-led", "green");

        addLog("Connected to HiveMQ", "success");

        client.subscribe([
            TOPICS.sub_data,
            TOPICS.sub_alert,
            TOPICS.sub_status
        ]);
    });

    client.on("reconnect", () => {
        setIndicator("mqtt-led", "yellow");
        addLog("Reconnecting...", "warn");
    });

    client.on("offline", () => {
        setIndicator("mqtt-led", "red");
        addLog("Offline", "error");
    });

    client.on("error", (err) => {
        addLog("MQTT Error: " + err.message, "error");
    });

    client.on("message", (topic, message) => {

        const payload = message.toString();

        try {

            if (topic === TOPICS.sub_data) {
                const data = JSON.parse(payload);
                handleTelemetryData(data);
                setIndicator("esp-led", "green");
            }

            else if (topic === TOPICS.sub_alert) {
                handleAlert(payload, "warn");
            }

            else if (topic === TOPICS.sub_status) {
                addLog(payload, "info");
            }

        } catch (e) {
            addLog("JSON Parse Error", "error");
        }
    });
}

/* ================= TELEMETRY ================= */

function handleTelemetryData(data) {

    updateValue("val-tds", data.tds.toFixed(1));
    updateValue("val-ph", data.ph.toFixed(2));
    updateValue("val-turbidity", data.turbidity.toFixed(2));
    updateValue("val-pressure", data.pressure.toFixed(2));

    updateValue("val-r1", data.r1);
    updateValue("val-r2", data.r2);
    updateValue("val-r3", data.r3);
    updateValue("val-r4", data.r4);

    updateTank("r1", data.r1);
    updateTank("r2", data.r2);
    updateTank("r3", data.r3);
    updateTank("r4", data.r4);

    updateNode("node-sand", data.sandFilter);
    updateNode("node-carbon1", data.carbon1);
    updateNode("node-cartridge", data.cartridge);
    updateNode("node-ro", data.roMembrane);
    updateNode("node-calcite", data.calcite);
    updateNode("node-carbon2", data.carbon2);

    updatePump(data.pump);
    updateMode(data.autoMode);

    setFlowState(data.pump);

    updateChart(data.tds, data.pressure, data.ph);
}

/* ================= HELPERS ================= */

function updateValue(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function updateNode(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value + "%";
}

function updateTank(id, value) {
    const tank = document.getElementById("tank-" + id);

    if (tank) {
        tank.style.height = value + "%";
    }
}

function updatePump(state) {

    const el = document.getElementById("val-pump");

    if (!el) return;

    el.textContent = state ? "ON" : "OFF";
    el.className = state ? "badge badge-green" : "badge badge-red";
}

function updateMode(state) {

    const el = document.getElementById("val-mode");

    if (!el) return;

    el.textContent = state ? "AUTO" : "MANUAL";
    el.className = state ? "badge badge-green" : "badge badge-yellow";
}

function setFlowState(active) {

    const flows = document.querySelectorAll(".flow");

    flows.forEach(flow => {
        if (active) flow.classList.add("active");
        else flow.classList.remove("active");
    });
}

function setIndicator(id, color) {
    const el = document.getElementById(id);
    if (el) el.className = "led led-" + color;
}

/* ================= COMMANDS ================= */

function publishCommand(cmd) {

    if (!client || !client.connected) {
        showToast("MQTT Not Connected", "error");
        return;
    }

    client.publish(TOPICS.pub_control, cmd);

    addLog("Command Sent: " + cmd, "info");
    showToast(cmd, "success");
}

/* ================= ALERTS ================= */

function handleAlert(message, severity) {
    addLog("ALERT: " + message, severity);
    showToast(message, severity);
}

function showToast(message, type) {

    const container = document.getElementById("toast-container");

    if (!container) return;

    const toast = document.createElement("div");

    toast.className = "toast " + type;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

/* ================= LOGS ================= */

function addLog(message, type = "info") {

    const container = document.getElementById("logs-container");

    if (!container) return;

    const entry = document.createElement("div");

    entry.className = "log-entry " + type;

    entry.textContent =
        "[" + new Date().toLocaleTimeString() + "] " + message;

    container.prepend(entry);

    if (container.children.length > 50) {
        container.removeChild(container.lastChild);
    }
}

/* ================= CHART ================= */

function initChart() {

    const ctx = document.getElementById("scadaChart");

    if (!ctx) return;

    scadaChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                {
                    label: "TDS",
                    data: [],
                    borderWidth: 2
                },
                {
                    label: "Pressure",
                    data: [],
                    borderWidth: 2
                },
                {
                    label: "pH",
                    data: [],
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            animation: false
        }
    });
}

function updateChart(tds, pressure, ph) {

    if (!scadaChart) return;

    const time = new Date().toLocaleTimeString();

    scadaChart.data.labels.push(time);
    scadaChart.data.datasets[0].data.push(tds);
    scadaChart.data.datasets[1].data.push(pressure);
    scadaChart.data.datasets[2].data.push(ph);

    if (scadaChart.data.labels.length > 30) {
        scadaChart.data.labels.shift();

        scadaChart.data.datasets.forEach(ds => ds.data.shift());
    }

    scadaChart.update();
}

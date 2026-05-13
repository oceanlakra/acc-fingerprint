import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function AccelerometerFingerprintDemo() {
  

  const [supported, setSupported] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [samples, setSamples] = useState([]);
  const [fingerprint, setFingerprint] = useState(null);
  const [knownDevices, setKnownDevices] = useState([]);
  const [matchResult, setMatchResult] = useState(null);
  const [status, setStatus] = useState("Idle");
  const [confidence, setConfidence] = useState(null);
  const [entropyEstimate, setEntropyEstimate] = useState(null);

  const motionRef = useRef([]);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("known_accel_devices") || "[]");
    setKnownDevices(saved);

    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
      setSupported(false);
    }
  }, []);

  const average = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  const variance = (arr, mean) => {
    return arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
  };

  const generateFingerprint = (data) => {
    const x = data.map((d) => d.x);
    const y = data.map((d) => d.y);
    const z = data.map((d) => d.z);

    const xMean = average(x);
    const yMean = average(y);
    const zMean = average(z);

    const xVar = variance(x, xMean);
    const yVar = variance(y, yMean);
    const zVar = variance(z, zMean);

    const magnitude = data.map((d) => Math.sqrt(d.x ** 2 + d.y ** 2 + d.z ** 2));
    const magMean = average(magnitude);

    const featureVector = {
      xMean: Number(xMean.toFixed(5)),
      yMean: Number(yMean.toFixed(5)),
      zMean: Number(zMean.toFixed(5)),
      xVar: Number(xVar.toFixed(5)),
      yVar: Number(yVar.toFixed(5)),
      zVar: Number(zVar.toFixed(5)),
      magMean: Number(magMean.toFixed(5)),
    };

    const fingerprintString = JSON.stringify(featureVector);

    let hash = 0;
    for (let i = 0; i < fingerprintString.length; i++) {
      const char = fingerprintString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }

    return {
      id: `ACC-${Math.abs(hash)}`,
      features: featureVector,
    };
  };

  const distance = (a, b) => {
    const keys = Object.keys(a);

    let sum = 0;

    keys.forEach((k) => {
      sum += Math.pow(a[k] - b[k], 2);
    });

    return Math.sqrt(sum);
  };

  const identifyDevice = (newFp) => {
    if (knownDevices.length === 0) {
      return null;
    }

    let bestMatch = null;
    let bestDistance = Infinity;

    knownDevices.forEach((device) => {
      const d = distance(newFp.features, device.features);

      if (d < bestDistance) {
        bestDistance = d;
        bestMatch = {
          device,
          distance: d,
        };
      }
    });

    return bestMatch;
  };

  const startCollection = async () => {
    setSamples([]);
    motionRef.current = [];
    setFingerprint(null);
    setMatchResult(null);

    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      try {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== "granted") {
          setStatus("Permission denied");
          return;
        }
      } catch (err) {
        setStatus("Permission error");
        return;
      }
    }

    setStatus("Collecting accelerometer data...");
    setCollecting(true);

    const handler = (event) => {
      const acc = event.accelerationIncludingGravity;

      if (!acc) return;

      const sample = {
        x: acc.x || 0,
        y: acc.y || 0,
        z: acc.z || 0,
        t: Date.now(),
      };

      motionRef.current.push(sample);
      setSamples([...motionRef.current]);
    };

    window.addEventListener("devicemotion", handler);

    setTimeout(() => {
      window.removeEventListener("devicemotion", handler);
      setCollecting(false);

      if (motionRef.current.length < 20) {
        setStatus("Not enough motion samples collected");
        return;
      }

      const fp = generateFingerprint(motionRef.current);
      setFingerprint(fp);

      const entropy = Object.values(fp.features)
        .reduce((acc, val) => acc + Math.abs(val), 0)
        .toFixed(2);

      setEntropyEstimate(entropy);

      const match = identifyDevice(fp);

      if (match && match.distance < 0.08) {
        const conf = Math.max(0, 100 - match.distance * 1000).toFixed(2);
        setConfidence(conf);
        setMatchResult({
          type: "known",
          match,
        });

        setStatus(`Previously seen device detected (${match.device.id})`);
      } else {
        const updated = [...knownDevices, fp];
        localStorage.setItem("known_accel_devices", JSON.stringify(updated));
        setKnownDevices(updated);

        setMatchResult({
          type: "new",
        });

        setConfidence(100);
        setStatus("New unique device registered");
      }
    }, 5000);
  };

  const clearDatabase = () => {
    localStorage.removeItem("known_accel_devices");
    setKnownDevices([]);
    setFingerprint(null);
    setMatchResult(null);
    setStatus("Database cleared");
  };

  if (!supported) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
        <div className="bg-zinc-900 rounded-3xl p-8 max-w-lg w-full border border-zinc-800">
          <h1 className="text-2xl font-bold mb-4">Accelerometer Not Supported</h1>
          <p className="text-zinc-400">
            Your browser or device does not expose DeviceMotion APIs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-zinc-900 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-zinc-900/80 backdrop-blur rounded-3xl p-8 border border-zinc-800 shadow-2xl"
        >
          <h1 className="text-4xl font-bold mb-4">
            Accelerometer Device Fingerprinting Demo
          </h1>

          <p className="text-zinc-400 leading-relaxed mb-6">
            This educational demo collects accelerometer motion data using the browser's DeviceMotion API and builds a lightweight hardware-style fingerprint using statistical properties of sensor readings.
          </p>

          <div className="flex gap-4 flex-wrap">
            <button
              onClick={startCollection}
              disabled={collecting}
              className="px-6 py-3 rounded-2xl bg-white text-black font-semibold disabled:opacity-50"
            >
              {collecting ? "Collecting..." : "Start Fingerprinting"}
            </button>

            <button
              onClick={clearDatabase}
              className="px-6 py-3 rounded-2xl border border-zinc-700"
            >
              Clear Known Devices
            </button>
          </div>

          <div className="mt-6 text-lg">
            <span className="font-semibold">Status:</span> {status}
          </div>
        </motion.div>

        <div className="grid md:grid-cols-4 gap-6">
          <motion.div whileHover={{ scale: 1.02 }} className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div className="text-zinc-400 text-sm">Samples Collected</div>
            <div className="text-4xl font-bold mt-2">{samples.length}</div>
          </motion.div>

          <motion.div whileHover={{ scale: 1.02 }} className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div className="text-zinc-400 text-sm">Known Devices</div>
            <div className="text-4xl font-bold mt-2">{knownDevices.length}</div>
          </motion.div>

          <motion.div whileHover={{ scale: 1.02 }} className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div className="text-zinc-400 text-sm">Entropy Estimate</div>
            <div className="text-4xl font-bold mt-2">{entropyEstimate || '--'}</div>
          </motion.div>

          <motion.div whileHover={{ scale: 1.02 }} className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <div className="text-zinc-400 text-sm">Recognition Confidence</div>
            <div className="text-4xl font-bold mt-2">{confidence ? `${confidence}%` : '--'}</div>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <h2 className="text-2xl font-semibold mb-4">Current Fingerprint</h2>

            {fingerprint ? (
              <div className="space-y-4">
                <div>
                  <div className="text-zinc-400 text-sm">Fingerprint ID</div>
                  <div className="text-xl font-mono break-all">
                    {fingerprint.id}
                  </div>
                </div>

                <div>
                  <div className="text-zinc-400 text-sm mb-2">Feature Vector</div>
                  <pre className="bg-black rounded-2xl p-4 overflow-auto text-sm">
                    {JSON.stringify(fingerprint.features, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="text-zinc-500">No fingerprint collected yet.</div>
            )}
          </div>

          <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
            <h2 className="text-2xl font-semibold mb-4">Identification Result</h2>

            {matchResult ? (
              <div>
                {matchResult.type === "known" ? (
                  <div className="space-y-4">
                    <div className="text-green-400 text-xl font-semibold">
                      Previously Seen Device
                    </div>

                    <div>
                      <div className="text-zinc-400 text-sm">Matched Device</div>
                      <div className="font-mono">
                        {matchResult.match.device.id}
                      </div>
                    </div>

                    <div>
                      <div className="text-zinc-400 text-sm">Distance Score</div>
                      <div>
                        {matchResult.match.distance.toFixed(6)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-blue-400 text-xl font-semibold">
                    New Device Registered
                  </div>
                )}
              </div>
            ) : (
              <div className="text-zinc-500">No identification performed yet.</div>
            )}
          </div>
        </div>

        <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
          <h2 className="text-2xl font-semibold mb-4">Live Accelerometer Graph</h2>

          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={samples.slice(-50).map((s, i) => ({
                index: i,
                x: s.x,
                y: s.y,
                z: s.z,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="index" stroke="#a1a1aa" />
                <YAxis stroke="#a1a1aa" />
                <Tooltip />
                <Line type="monotone" dataKey="x" stroke="#3b82f6" dot={false} />
                <Line type="monotone" dataKey="y" stroke="#22c55e" dot={false} />
                <Line type="monotone" dataKey="z" stroke="#ef4444" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
          <h2 className="text-2xl font-semibold mb-4">Known Device Database</h2>

          <div className="grid gap-4">
            {knownDevices.length === 0 ? (
              <div className="text-zinc-500">No devices stored yet.</div>
            ) : (
              knownDevices.map((device, idx) => (
                <div
                  key={idx}
                  className="bg-black rounded-2xl p-4 border border-zinc-800"
                >
                  <div className="font-mono mb-2">{device.id}</div>

                  <pre className="text-xs overflow-auto text-zinc-400">
                    {JSON.stringify(device.features, null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-zinc-900 rounded-3xl p-6 border border-zinc-800">
          <h2 className="text-2xl font-semibold mb-4">How This Works</h2>

          <ul className="space-y-3 text-zinc-300 leading-relaxed list-disc pl-6">
            <li>
              The browser reads accelerometer data using the DeviceMotion API.
            </li>
            <li>
              Statistical properties like mean, variance, and motion magnitude are extracted.
            </li>
            <li>
              These values form a lightweight device fingerprint.
            </li>
            <li>
              The fingerprint is compared against previously stored fingerprints.
            </li>
            <li>
              If the distance is small enough, the device is considered previously seen.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

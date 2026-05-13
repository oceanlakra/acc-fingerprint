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

interface Sample {
  x: number;
  y: number;
  z: number;
  t: number;
}

interface FingerprintFeatures {
  xMean: number;
  yMean: number;
  zMean: number;
  xVar: number;
  yVar: number;
  zVar: number;
  magMean: number;
}

interface Fingerprint {
  id: string;
  features: FingerprintFeatures;
}

interface MatchResult {
  type: "known" | "new";
  match?: {
    device: Fingerprint;
    distance: number;
  };
}

export default function AccelerometerFingerprintDemo() {
  const [supported, setSupported] = useState<boolean>(true);
  const [collecting, setCollecting] = useState<boolean>(false);

  const [samples, setSamples] = useState<Sample[]>([]);
  const [fingerprint, setFingerprint] = useState<Fingerprint | null>(null);

  const [knownDevices, setKnownDevices] = useState<Fingerprint[]>([]);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

  const [status, setStatus] = useState<string>("Idle");

  const [confidence, setConfidence] = useState<string | null>(null);
  const [entropyEstimate, setEntropyEstimate] = useState<string | null>(null);

  const motionRef = useRef<Sample[]>([]);

  useEffect(() => {
    const saved: Fingerprint[] = JSON.parse(
      localStorage.getItem("known_accel_devices") || "[]"
    );

    setKnownDevices(saved);

    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
      setSupported(false);
    }
  }, []);

  const average = (arr: number[]): number =>
    arr.reduce((a: number, b: number) => a + b, 0) / arr.length;

  const variance = (arr: number[], mean: number): number => {
    return (
      arr.reduce(
        (sum: number, val: number) => sum + Math.pow(val - mean, 2),
        0
      ) / arr.length
    );
  };

  const generateFingerprint = (data: Sample[]): Fingerprint => {
    const x = data.map((d) => d.x);
    const y = data.map((d) => d.y);
    const z = data.map((d) => d.z);

    const xMean = average(x);
    const yMean = average(y);
    const zMean = average(z);

    const xVar = variance(x, xMean);
    const yVar = variance(y, yMean);
    const zVar = variance(z, zMean);

    const magnitude = data.map((d) =>
      Math.sqrt(d.x ** 2 + d.y ** 2 + d.z ** 2)
    );

    const magMean = average(magnitude);

    const featureVector: FingerprintFeatures = {
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

  const distance = (
    a: FingerprintFeatures,
    b: FingerprintFeatures
  ): number => {
    const keys = Object.keys(a) as (keyof FingerprintFeatures)[];

    let sum = 0;

    keys.forEach((k) => {
      sum += Math.pow(a[k] - b[k], 2);
    });

    return Math.sqrt(sum);
  };

  const identifyDevice = (
    newFp: Fingerprint
  ): { device: Fingerprint; distance: number } | null => {
    if (knownDevices.length === 0) {
      return null;
    }

    let bestMatch: {
      device: Fingerprint;
      distance: number;
    } | null = null;

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
      typeof (DeviceMotionEvent as any).requestPermission === "function"
    ) {
      try {
        const permission = await (DeviceMotionEvent as any).requestPermission();

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

    const handler = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;

      if (!acc) return;

      const sample: Sample = {
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
        .reduce((acc: number, val: number) => acc + Math.abs(val), 0)
        .toFixed(2);

      setEntropyEstimate(entropy);

      const match = identifyDevice(fp);

      if (match && match.distance < 0.08) {
        const conf = Math.max(
          0,
          100 - match.distance * 1000
        ).toFixed(2);

        setConfidence(conf);

        setMatchResult({
          type: "known",
          match,
        });

        setStatus(
          `Previously seen device detected (${match.device.id})`
        );
      } else {
        const updated = [...knownDevices, fp];

        localStorage.setItem(
          "known_accel_devices",
          JSON.stringify(updated)
        );

        setKnownDevices(updated);

        setMatchResult({
          type: "new",
        });

        setConfidence("100");

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
          <h1 className="text-2xl font-bold mb-4">
            Accelerometer Not Supported
          </h1>

          <p className="text-zinc-400">
            Your browser or device does not expose DeviceMotion APIs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-zinc-900 text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-5xl font-bold mb-4">
          Accelerometer Device Fingerprinting
        </h1>

        <p className="text-zinc-400 mb-8">
          Research-inspired proof-of-concept demonstrating sensor-based device recognition using browser motion APIs.
        </p>

        {/* KEEP REST OF YOUR JSX SAME */}
      </div>
    </div>
  );
}

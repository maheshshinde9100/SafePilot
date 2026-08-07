import React, { useState } from "react";

// ==========================================
// CONFIGURATION
// ==========================================
// The exact URL you confirmed is working in your browser:
const WORKING_URL = "http://192.168.233.18";

const ESP32Camera = () => {
    const [error, setError] = useState(false);

    return (
        <div className="flex flex-col items-center justify-center w-full max-w-[720px] mx-auto p-4 bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden group">
            {/* 
          Increased height and width for better visibility
      */}
            <div className="relative w-full h-[540px] bg-black rounded-2xl overflow-hidden border-2 border-slate-800 shadow-inner">
                {!error ? (
                    <iframe
                        src={WORKING_URL}
                        title="ESP32 CAM Feed"
                        className="w-full h-full border-none"
                        style={{
                            overflow: 'hidden',
                            background: 'black',
                        }}
                        scrolling="no"
                        onError={() => setError(true)}
                    ></iframe>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 p-6 text-center">
                        <span className="text-4xl mb-4"> </span>
                        <p className="text-sm font-bold text-slate-300 mb-1">CAMERA CONNECTION ERROR</p>
                        <p className="text-xs text-slate-500">
                            Make sure the ESP32 is powered on and your computer is on the same WiFi network.
                        </p>
                        <button
                            onClick={() => setError(false)}
                            className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold transition-all"
                        >
                            RETRY LOAD
                        </button>
                    </div>
                )}

                {/* HUD Elements */}
                <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-100">Live Dashboard Feed</span>
                </div>

                {/* Aesthetic HUD Lines */}
                <div className="absolute top-4 right-4 text-[9px] font-mono text-slate-400 opacity-60">
                    LOC: 192.168.233.18 <br />
                    PROT: HTTP_DIRECT
                </div>
            </div>

            <div className="mt-4 w-full flex items-center justify-between text-[10px] font-mono text-slate-600 px-2 uppercase tracking-tighter">
                <span>Safepilot AI-Monitor</span>
                <button
                    onClick={() => window.open(WORKING_URL, '_blank')}
                    className="text-cyan-600 hover:text-cyan-400 font-bold transition-colors underline"
                >
                    Open Original Link
                </button>
            </div>
        </div>
    );
};

export default ESP32Camera;

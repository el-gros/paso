import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })

export class AudioService {

    beepInterval: any = undefined;
    audioCtx: AudioContext | null = null;

    constructor() {}

    // START BEEP INTERVAL /////////////////////
    startBeepInterval() {
        // Clear any existing interval to avoid duplicates
        if (this.beepInterval) {
            clearInterval(this.beepInterval);
        }
        // Set an interval to play the beep every 120 seconds
        this.beepInterval = setInterval(() => {
            requestAnimationFrame(() => this.playBeep(600, .001, .001));
        }, 120000);
    }

    // STOP BEEP INTERVAL ////////////////////////////
    stopBeepInterval() {
        if (this.beepInterval) {
            clearInterval(this.beepInterval);
            this.beepInterval = undefined; // Reset the interval reference
        }
    }

    // PLAY A BEEP
    async playBeep(freq: number, time: number, volume: number) {
        // Initialize audio context if not already created
        if (!this.audioCtx) {
            this.audioCtx = new window.AudioContext;
        }
        const oscillator = this.audioCtx.createOscillator();
        const gainNode =this.audioCtx.createGain();  // Create a gain node
        // Configure oscillator
        oscillator.type = 'sine'; // Other waveforms: 'square', 'sawtooth', 'triangle'
        oscillator.frequency.setValueAtTime(freq, this.audioCtx.currentTime);  // Set frequency
        // Set initial gain (volume)
        gainNode.gain.setValueAtTime(volume, this.audioCtx.currentTime);       // Set initial volume
        // Connect nodes
        oscillator.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        // Start and stop the oscillator after the specified duration
        oscillator.start();
        console.log('beeping')
        oscillator.stop(this.audioCtx.currentTime + time);
        // Clean up after the sound has finished
        oscillator.onended = async () => {
            oscillator.disconnect();
            gainNode.disconnect();
        };
    }

    // PLAY A DOUBLE BEEP
    async playDoubleBeep(freq: number, time: number, volume: number, gap: number) {
        // Initialize audio context if not already created
        if (!this.audioCtx) {
        this.audioCtx = new window.AudioContext();
        }
        const oscillator = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();
        // Configure oscillator
        oscillator.type = 'sine'; // Other waveforms: 'square', 'sawtooth', 'triangle'
        oscillator.frequency.setValueAtTime(freq, this.audioCtx.currentTime); // Set frequency
        // Connect nodes
        oscillator.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        const now = this.audioCtx.currentTime;
        // Double beep timing
        gainNode.gain.setValueAtTime(0, now); // Start with volume off
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.01); // Ramp up quickly for first beep
        gainNode.gain.linearRampToValueAtTime(0, now + time); // Ramp down after first beep
        gainNode.gain.setValueAtTime(0, now + time + gap); // Silence for gap
        gainNode.gain.linearRampToValueAtTime(volume, now + time + gap + 0.01); // Ramp up for second beep
        gainNode.gain.linearRampToValueAtTime(0, now + time + gap + time); // Ramp down after second beep
        // Start and stop oscillator
        oscillator.start(now);
        oscillator.stop(now + time + gap + time); // Total duration: first beep + gap + second beep
        // Clean up after the sound has finished
        oscillator.onended = async () => {
        oscillator.disconnect();
        gainNode.disconnect();
        };
    }

}    
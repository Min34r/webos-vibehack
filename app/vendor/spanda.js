/*
 * spanda 0.1.1 (https://github.com/rittikbasu/spanda): procedural interface sounds, no audio files.
 * The npm build, unchanged except that its three exports become window.Spanda (the launcher has no modules).
 *
 * MIT License
 *
 * Copyright (c) 2026 Spanda contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(function () {
function deepFreeze(value) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
        if (nested && typeof nested === 'object' && !Object.isFrozen(nested))
            deepFreeze(nested);
    }
    return value;
}
const profiles = deepFreeze({
    tactile: {
        baseFrequency: 118,
        decayMs: 46,
        attackMs: 1,
        waveform: 'sine',
        bodyLowpass: 540,
        transient: { amount: 0.16, frequency: 420, type: 'lowpass', durationMs: 12 },
        sub: 0.23,
        click: 0,
        ping: 0,
        pitchVariationPercent: 2,
        volumeVariationPercent: 5,
        reverb: 0.18,
        layerSpreadMs: 3,
        completionStyle: 'tactile',
    },
    crisp: {
        baseFrequency: 240,
        decayMs: 20,
        attackMs: 1,
        waveform: 'sine',
        bodyLowpass: 1_800,
        transient: { amount: 0.62, frequency: 5_200, type: 'bandpass', durationMs: 5 },
        sub: 0.02,
        click: 1,
        ping: 0.42,
        clickFrequency: 5_200,
        clickMs: 5,
        pingFrequency: 3_600,
        pitchVariationPercent: 1,
        volumeVariationPercent: 5,
        reverb: 0.08,
        layerSpreadMs: 2,
        completionStyle: 'crisp',
    },
    lush: {
        baseFrequency: 104,
        decayMs: 72,
        attackMs: 8,
        waveform: 'sine',
        bodyLowpass: 520,
        transient: { amount: 0.12, frequency: 260, type: 'lowpass', durationMs: 18 },
        sub: 0.53,
        click: 0,
        ping: 0,
        pitchVariationPercent: 7,
        volumeVariationPercent: 12,
        reverb: 0.42,
        layerSpreadMs: 10,
        completionStyle: 'lush',
    },
});
const recipes = {
    toggleOn: {
        hits: [{ pitch: 1.14, gain: 0.48, glide: 1.025 }],
        decay: 0.3,
        transient: 0.48,
        sub: 0.22,
        reverb: 0.25,
    },
    toggleOff: {
        hits: [{ pitch: 0.87, gain: 0.46, glide: 0.975 }],
        decay: 0.32,
        transient: 0.42,
        sub: 0.24,
        reverb: 0.22,
    },
    notify: {
        hits: [
            { offset: 0.012, pitch: 1.2, gain: 0.36, glide: 0.99 },
            { offset: 0.082, pitch: 0.94, gain: 0.24, glide: 0.9 },
        ],
        tone: { offset: 0.044, pitch: 3.1, gain: 0.055, decay: 1.25, glide: 1.06, jitter: 0.45 },
        decay: 1.36,
        reverb: 1.55,
        transient: 0.09,
        sub: 0.1,
    },
    open: {
        hits: [{ offset: 0.01, pitch: 0.98, gain: 0.32, glide: 1.16 }],
        tone: { offset: 0.035, pitch: 2.65, gain: 0.04, decay: 0.8, glide: 1.18, jitter: 0.55 },
        decay: 1.05,
        reverb: 0.75,
        transient: 0.12,
        sub: 0.08,
    },
    close: {
        hits: [{ pitch: 0.96, gain: 0.28, glide: 0.82 }],
        tone: { offset: 0.02, pitch: 2.35, gain: 0.028, decay: 0.45, glide: 0.88, jitter: 0.55 },
        decay: 0.62,
        reverb: 0.35,
        transient: 0.16,
        sub: 0.08,
    },
    send: {
        hits: [{ pitch: 1.12, gain: 0.5, glide: 1.28 }],
        tone: { offset: 0.018, pitch: 3.45, gain: 0.07, decay: 0.52, glide: 1.16, jitter: 0.65 },
        decay: 0.72,
        reverb: 0.55,
        transient: 0.36,
        sub: 0.12,
    },
    error: {
        hits: [
            { pitch: 0.64, gain: 0.54, glide: 0.84 },
            { offset: 0.066, pitch: 0.47, gain: 0.38, glide: 0.78 },
        ],
        decay: 0.76,
        reverb: 0.14,
        transient: 0.18,
        sub: 0.52,
    },
    confirm: {
        hits: [
            { pitch: 1.04, gain: 0.56, glide: 1.03 },
            { offset: 0.104, pitch: 1.68, gain: 0.5, glide: 1.1 },
        ],
        tone: { offset: 0.106, pitch: 4.9, gain: 0.085, decay: 1.3, glide: 1.04, jitter: 0.08 },
        decay: 1.72,
        reverb: 0.92,
        transient: 0.42,
        sub: 0.28,
    },
    type: {
        hits: [{ pitch: 0.92, gain: 0.16, glide: 1.03 }],
        tone: { offset: 0.02, pitch: 2.25, gain: 0.025, decay: 0.45, glide: 1.02, jitter: 0.8 },
        decay: 0.38,
        reverb: 0.3,
        transient: 0.16,
        sub: 0.1,
    },
};
const completeCue = { kind: 'complete' };
const cues = deepFreeze({
    tap: recipes.toggleOn,
    type: recipes.type,
    toggleOn: recipes.toggleOn,
    toggleOff: recipes.toggleOff,
    notify: recipes.notify,
    open: recipes.open,
    close: recipes.close,
    send: recipes.send,
    confirm: recipes.confirm,
    error: recipes.error,
    complete: completeCue,
});
function clamp(value, minimum, maximum) {
    if (Number.isNaN(value))
        return minimum;
    return Math.min(maximum, Math.max(minimum, value));
}
function randomBetween(minimum, maximum) {
    return minimum + Math.random() * (maximum - minimum);
}
function resolveProfile(profile) {
    return typeof profile === 'string' ? profiles[profile] : profile;
}
function isCompleteCue(cue) {
    return 'kind' in cue && cue.kind === 'complete';
}
function createImpulse(context) {
    const length = Math.floor(context.sampleRate * 0.1);
    const buffer = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let index = 0; index < length; index += 1) {
            data[index] = (Math.random() * 2 - 1) * ((1 - index / length) ** 3);
        }
    }
    return buffer;
}
function createNoise(context) {
    const length = Math.floor(context.sampleRate * 0.2);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
        data[index] = Math.random() * 2 - 1;
    }
    return buffer;
}
function createGraph(volume) {
    const audioGlobal = globalThis;
    const AudioContextClass = audioGlobal.AudioContext ?? audioGlobal.webkitAudioContext;
    if (!AudioContextClass)
        return null;
    let context = null;
    try {
        context = new AudioContextClass();
        const compressor = context.createDynamicsCompressor();
        compressor.connect(context.destination);
        const master = context.createGain();
        master.gain.value = volume;
        master.connect(compressor);
        const reverb = context.createConvolver();
        reverb.buffer = createImpulse(context);
        const reverbFilter = context.createBiquadFilter();
        reverbFilter.type = 'lowpass';
        reverbFilter.frequency.value = 2_200;
        reverb.connect(reverbFilter);
        reverbFilter.connect(master);
        return {
            context,
            master,
            reverb,
            noise: createNoise(context),
            waves: new Map(),
        };
    }
    catch {
        if (context)
            closeSilently(context);
        return null;
    }
}
function closeSilently(context) {
    if (context.state === 'closed')
        return;
    try {
        void context.close().catch(() => { });
    }
    catch {
        // Some browser implementations throw before returning a promise.
    }
}
function suspendSilently(context) {
    if (context.state !== 'running')
        return;
    try {
        void context.suspend().catch(() => { });
    }
    catch {
        // Some browser implementations throw before returning a promise.
    }
}
function renderHit(graph, at, recipe, hit, profile) {
    const { context } = graph;
    const pitchVariation = randomBetween(-profile.pitchVariationPercent, profile.pitchVariationPercent) / 100;
    const frequency = profile.baseFrequency * hit.pitch * (1 + pitchVariation);
    const amplitude = 0.8 * hit.gain * (1 + randomBetween(-profile.volumeVariationPercent, profile.volumeVariationPercent) / 100);
    const attack = Math.max(0.001, profile.attackMs / 1_000);
    const decay = (profile.decayMs / 1_000) * recipe.decay;
    const bodyAttack = Math.max(attack, 0.003);
    const release = Math.max(0.006, Math.min(0.018, 0.22 * decay));
    const spread = Math.max(0, (profile.layerSpreadMs + randomBetween(-1, 1)) / 1_000);
    const transientAmount = profile.transient.amount * recipe.transient;
    const subAmount = profile.sub * recipe.sub;
    const reverbAmount = Math.min(0.6, profile.reverb * recipe.reverb);
    const output = context.createGain();
    output.gain.value = 1;
    output.connect(graph.master);
    let wetGain = null;
    if (reverbAmount > 0.001) {
        wetGain = context.createGain();
        wetGain.gain.value = reverbAmount;
        output.connect(wetGain);
        wetGain.connect(graph.reverb);
    }
    let activeSources = 0;
    const track = (source) => {
        activeSources += 1;
        source.addEventListener('ended', () => {
            source.disconnect();
            activeSources -= 1;
            if (activeSources === 0) {
                output.disconnect();
                wetGain?.disconnect();
            }
        }, { once: true });
    };
    if (transientAmount > 0.02) {
        const source = context.createBufferSource();
        source.buffer = graph.noise;
        const filter = context.createBiquadFilter();
        filter.type = profile.transient.type;
        filter.frequency.value = profile.transient.frequency;
        filter.Q.value = profile.transient.type === 'lowpass' ? 0.5 : 0.8;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.linearRampToValueAtTime(transientAmount * amplitude * 0.6, at + 0.0015);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.0015 + profile.transient.durationMs / 1_000);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(output);
        track(source);
        source.start(at);
        source.stop(at + 0.06);
    }
    const bodyStart = at + spread;
    const body = context.createOscillator();
    body.type = profile.waveform;
    body.frequency.setValueAtTime(frequency, bodyStart);
    body.frequency.exponentialRampToValueAtTime(frequency * hit.glide, bodyStart + attack + 0.7 * decay);
    const bodyFilter = context.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.value = profile.bodyLowpass;
    bodyFilter.Q.value = 0.5;
    const bodyGain = context.createGain();
    bodyGain.gain.setValueAtTime(0, bodyStart);
    bodyGain.gain.linearRampToValueAtTime(amplitude, bodyStart + bodyAttack);
    bodyGain.gain.exponentialRampToValueAtTime(0.0008, bodyStart + bodyAttack + decay);
    bodyGain.gain.linearRampToValueAtTime(0.0001, bodyStart + bodyAttack + decay + release);
    body.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(output);
    track(body);
    body.start(bodyStart);
    body.stop(bodyStart + bodyAttack + decay + release + 0.05);
    if (subAmount > 0.01) {
        const subStart = at + 2 * spread;
        const subAttack = Math.max(bodyAttack + 0.004, 0.008);
        const sub = context.createOscillator();
        sub.type = 'sine';
        sub.frequency.value = frequency / 2;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0, subStart);
        gain.gain.linearRampToValueAtTime(subAmount * amplitude, subStart + subAttack);
        gain.gain.exponentialRampToValueAtTime(0.0008, subStart + subAttack + decay);
        gain.gain.linearRampToValueAtTime(0.0001, subStart + subAttack + decay + release);
        sub.connect(gain);
        gain.connect(output);
        track(sub);
        sub.start(subStart);
        sub.stop(subStart + subAttack + decay + release + 0.05);
    }
    if (profile.click > 0.01) {
        const source = context.createBufferSource();
        source.buffer = graph.noise;
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = (profile.clickFrequency ?? 4_000) * (1 + pitchVariation);
        filter.Q.value = 3.5;
        const gain = context.createGain();
        const clickAmount = profile.click * amplitude * 0.5 * recipe.transient;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.linearRampToValueAtTime(clickAmount, at + 0.0015);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.0015 + (profile.clickMs ?? 6) / 1_000);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(output);
        track(source);
        source.start(at);
        source.stop(at + 0.05);
    }
    if (profile.ping > 0.01) {
        const oscillator = context.createOscillator();
        oscillator.type = 'sine';
        const pingFrequency = (profile.pingFrequency ?? 3_000) * hit.pitch * (1 + pitchVariation);
        oscillator.frequency.setValueAtTime(pingFrequency, at);
        oscillator.frequency.exponentialRampToValueAtTime(0.94 * pingFrequency, at + decay);
        const gain = context.createGain();
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(profile.ping * amplitude * 0.35, at + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.4 * decay);
        oscillator.connect(gain);
        gain.connect(output);
        track(oscillator);
        oscillator.start(at);
        oscillator.stop(at + 1.5 * decay + 0.05);
    }
    if (recipe.tone) {
        const tone = recipe.tone;
        const toneVariation = pitchVariation * tone.jitter;
        const toneStart = at + tone.offset;
        const toneDecay = decay * tone.decay;
        const toneFrequency = profile.baseFrequency * tone.pitch * (1 + toneVariation);
        const oscillator = context.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(toneFrequency, toneStart);
        oscillator.frequency.exponentialRampToValueAtTime(toneFrequency * tone.glide, toneStart + toneDecay);
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = Math.max(880, Math.min(2_400, 2.2 * profile.bodyLowpass));
        filter.Q.value = 0.45;
        const gain = context.createGain();
        gain.gain.setValueAtTime(0, toneStart);
        gain.gain.linearRampToValueAtTime(tone.gain * amplitude, toneStart + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0008, toneStart + 0.006 + toneDecay);
        gain.gain.linearRampToValueAtTime(0.0001, toneStart + 0.006 + toneDecay + release);
        oscillator.connect(filter);
        filter.connect(gain);
        gain.connect(output);
        track(oscillator);
        oscillator.start(toneStart);
        oscillator.stop(toneStart + 0.006 + toneDecay + release + 0.05);
    }
}
function renderRecipe(graph, recipe, profile) {
    const start = graph.context.currentTime + 0.002;
    for (const hit of recipe.hits) {
        renderHit(graph, start + (hit.offset ?? 0), recipe, hit, profile);
    }
}
function getHarmonicWave(graph, harmonics) {
    const cached = graph.waves.get(harmonics);
    if (cached)
        return cached;
    const real = new Float32Array(4);
    const imaginary = new Float32Array(4);
    imaginary[1] = 1;
    real[2] = harmonics * Math.sin(0.21);
    imaginary[2] = harmonics * Math.cos(0.21);
    real[3] = harmonics * 0.16 * Math.sin(0.37);
    imaginary[3] = harmonics * 0.16 * Math.cos(0.37);
    const wave = graph.context.createPeriodicWave(real, imaginary);
    graph.waves.set(harmonics, wave);
    return wave;
}
const tactileCompletion = {
    pitch: 1,
    timing: 1,
    attack: 1,
    decay: 1,
    gain: 1,
    pan: 1,
    harmonics: 1,
    sub: 1,
    output: 1.8,
    wet: 0.26,
    contactFrequency: 440,
    contactGain: 0.12,
    contactAttack: 0.0015,
    contactDuration: 0.034,
    airHighpass: 480,
    airLowpass: 1_850,
    airGain: 0.009,
    airAttack: 0.13,
    airDuration: 0.4,
};
const crispCompletion = {
    pitch: 1.35,
    timing: 0.82,
    attack: 0.65,
    decay: 0.68,
    gain: 0.9,
    pan: 0.75,
    harmonics: 0.4,
    sub: 0.25,
    output: 1.65,
    wet: 0.12,
    contactFrequency: 1_200,
    contactGain: 0.085,
    contactAttack: 0.0008,
    contactDuration: 0.018,
    airHighpass: 900,
    airLowpass: 3_800,
    airGain: 0.006,
    airAttack: 0.08,
    airDuration: 0.26,
};
const lushCompletion = {
    pitch: 0.88,
    timing: 1.12,
    attack: 1.65,
    decay: 1.35,
    gain: 0.95,
    pan: 1.2,
    harmonics: 0.7,
    sub: 1.4,
    output: 1.7,
    wet: 0.42,
    contactFrequency: 360,
    contactGain: 0.095,
    contactAttack: 0.003,
    contactDuration: 0.05,
    airHighpass: 320,
    airLowpass: 1_450,
    airGain: 0.013,
    airAttack: 0.18,
    airDuration: 0.56,
};
function getCompletionStyle(profile) {
    switch (profile.completionStyle) {
        case 'crisp': return crispCompletion;
        case 'lush': return lushCompletion;
        default: return tactileCompletion;
    }
}
function renderComplete(graph, profile) {
    const { context } = graph;
    const style = getCompletionStyle(profile);
    const start = context.currentTime + 0.002;
    const output = context.createGain();
    output.gain.value = style.output;
    output.connect(graph.master);
    const wetGain = context.createGain();
    wetGain.gain.value = style.wet;
    output.connect(wetGain);
    wetGain.connect(graph.reverb);
    let activeSources = 0;
    const track = (source) => {
        activeSources += 1;
        source.addEventListener('ended', () => {
            source.disconnect();
            activeSources -= 1;
            if (activeSources === 0) {
                output.disconnect();
                wetGain.disconnect();
            }
        }, { once: true });
    };
    const addTone = (offset, frequency, glide, attack, decay, gainValue, panValue, harmonics, subAmount = 0) => {
        const toneStart = start + offset * style.timing;
        const styledAttack = attack * style.attack;
        const styledDecay = decay * style.decay;
        const styledGain = gainValue * style.gain;
        const toneEnd = toneStart + styledAttack + styledDecay;
        const oscillator = context.createOscillator();
        const styledHarmonics = harmonics * style.harmonics;
        if (styledHarmonics > 0)
            oscillator.setPeriodicWave(getHarmonicWave(graph, styledHarmonics));
        else
            oscillator.type = 'sine';
        const styledFrequency = frequency * style.pitch;
        oscillator.frequency.setValueAtTime(styledFrequency, toneStart);
        oscillator.frequency.exponentialRampToValueAtTime(styledFrequency * glide, toneEnd);
        const gain = context.createGain();
        gain.gain.setValueAtTime(0, toneStart);
        gain.gain.linearRampToValueAtTime(styledGain, toneStart + styledAttack);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, styledGain * Math.exp(-5.6)), toneEnd);
        gain.gain.linearRampToValueAtTime(0.0001, toneEnd + 0.02);
        const createStereoPanner = context.createStereoPanner?.bind(context);
        const panner = createStereoPanner?.();
        if (panner)
            panner.pan.value = panValue * style.pan;
        oscillator.connect(gain);
        if (panner) {
            gain.connect(panner);
            panner.connect(output);
        }
        else {
            gain.connect(output);
        }
        track(oscillator);
        oscillator.start(toneStart);
        oscillator.stop(toneEnd + 0.03);
        if (subAmount <= 0)
            return;
        const sub = context.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(styledFrequency / 2, toneStart);
        sub.frequency.exponentialRampToValueAtTime(styledFrequency * glide / 2, toneEnd);
        const subGain = context.createGain();
        const styledSubGain = styledGain * subAmount * style.sub;
        subGain.gain.setValueAtTime(0, toneStart);
        subGain.gain.linearRampToValueAtTime(styledSubGain, toneStart + styledAttack);
        subGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, styledSubGain * Math.exp(-5.6)), toneEnd);
        subGain.gain.linearRampToValueAtTime(0.0001, toneEnd + 0.02);
        sub.connect(subGain);
        if (panner)
            subGain.connect(panner);
        else
            subGain.connect(output);
        track(sub);
        sub.start(toneStart);
        sub.stop(toneEnd + 0.03);
    };
    const contact = context.createBufferSource();
    contact.buffer = graph.noise;
    const contactFilterA = context.createBiquadFilter();
    contactFilterA.type = 'lowpass';
    contactFilterA.frequency.value = style.contactFrequency;
    contactFilterA.Q.value = 0.5;
    const contactFilterB = context.createBiquadFilter();
    contactFilterB.type = 'lowpass';
    contactFilterB.frequency.value = style.contactFrequency;
    contactFilterB.Q.value = 0.5;
    const contactGain = context.createGain();
    contactGain.gain.setValueAtTime(0, start);
    contactGain.gain.linearRampToValueAtTime(style.contactGain, start + style.contactAttack);
    contactGain.gain.exponentialRampToValueAtTime(0.0001, start + style.contactDuration);
    contact.connect(contactFilterA);
    contactFilterA.connect(contactFilterB);
    contactFilterB.connect(contactGain);
    contactGain.connect(output);
    track(contact);
    contact.start(start);
    contact.stop(start + Math.max(0.06, style.contactDuration + 0.02));
    addTone(0, 118, 0.93, 0.003, 0.13, 0.19, 0, 0.11, 0.12);
    const airStart = start + 0.055 * style.timing;
    const air = context.createBufferSource();
    air.buffer = graph.noise;
    const airHighpass = context.createBiquadFilter();
    airHighpass.type = 'highpass';
    airHighpass.frequency.value = style.airHighpass;
    airHighpass.Q.value = 0.5;
    const airLowpass = context.createBiquadFilter();
    airLowpass.type = 'lowpass';
    airLowpass.frequency.value = style.airLowpass;
    airLowpass.Q.value = 0.5;
    const airGain = context.createGain();
    airGain.gain.setValueAtTime(0, airStart);
    airGain.gain.linearRampToValueAtTime(style.airGain, airStart + style.airAttack);
    airGain.gain.exponentialRampToValueAtTime(0.0001, airStart + style.airDuration);
    air.connect(airHighpass);
    airHighpass.connect(airLowpass);
    airLowpass.connect(airGain);
    airGain.connect(output);
    track(air);
    air.start(airStart);
    air.stop(airStart + style.airDuration + 0.03);
    addTone(0.105, 236, 1.012, 0.022, 0.39, 0.105, -0.14, 0.055);
    addTone(0.126, 295, 1.009, 0.026, 0.42, 0.081, 0.12, 0.045);
    addTone(0.148, 354, 1.006, 0.03, 0.45, 0.061, -0.02, 0.03);
    addTone(0.174, 590, 0.998, 0.035, 0.36, 0.022, 0.16, 0);
}
function createSpanda(options = {}) {
    let currentProfile = resolveProfile(options.profile ?? 'tactile');
    let currentVolume = clamp(options.volume ?? 1, 0, 1);
    let enabled = options.enabled ?? true;
    let graph = null;
    let destroyed = false;
    const getGraph = () => {
        if (destroyed)
            return null;
        graph ??= createGraph(currentVolume);
        return graph;
    };
    const canUseResumedGraph = (audio) => {
        if (destroyed) {
            closeSilently(audio.context);
            return false;
        }
        if (!enabled) {
            suspendSilently(audio.context);
            return false;
        }
        return true;
    };
    const playRecipe = (audio, cue, profile) => {
        const resolved = typeof cue === 'string' ? cues[cue] : cue;
        if (isCompleteCue(resolved)) {
            renderComplete(audio, profile);
            return;
        }
        renderRecipe(audio, resolved, profile);
    };
    return {
        play(cue, options) {
            if (!enabled)
                return;
            const profile = resolveProfile(options?.profile ?? currentProfile);
            const audio = getGraph();
            if (!audio)
                return;
            const state = audio.context.state;
            if (state === 'suspended' || state === 'interrupted') {
                try {
                    void audio.context.resume()
                        .then(() => {
                        if (!canUseResumedGraph(audio))
                            return;
                        playRecipe(audio, cue, profile);
                    })
                        .catch(() => { });
                }
                catch {
                    // Some browser implementations throw before returning a promise.
                }
                return;
            }
            try {
                playRecipe(audio, cue, profile);
            }
            catch {
                // Interface sound is progressive enhancement.
            }
        },
        async resume() {
            if (!enabled)
                return;
            const audio = getGraph();
            if (!audio || audio.context.state === 'running')
                return;
            try {
                await audio.context.resume();
                canUseResumedGraph(audio);
            }
            catch {
                // Browsers may reject resume outside a user gesture.
            }
        },
        setEnabled(value) {
            enabled = value;
            if (!value && graph)
                suspendSilently(graph.context);
        },
        setProfile(profile) {
            currentProfile = resolveProfile(profile);
        },
        setVolume(volume) {
            currentVolume = clamp(volume, 0, 1);
            if (graph)
                graph.master.gain.value = currentVolume;
        },
        async destroy() {
            if (destroyed)
                return;
            destroyed = true;
            const context = graph?.context;
            graph = null;
            if (!context || context.state === 'closed')
                return;
            try {
                await context.close();
            }
            catch {
                // Closing audio should not affect application teardown.
            }
        },
        get enabled() {
            return enabled;
        },
        get profile() {
            return currentProfile;
        },
        get volume() {
            return currentVolume;
        },
    };
}

window.Spanda = { createSpanda: createSpanda, cues: cues, profiles: profiles };
})();

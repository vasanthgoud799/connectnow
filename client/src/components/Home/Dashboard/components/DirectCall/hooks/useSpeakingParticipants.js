import { useEffect, useState } from "react";

const THRESHOLD = 28;

export const useSpeakingParticipants = (participants = []) => {
  const [speakingIds, setSpeakingIds] = useState([]);

  useEffect(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass || !participants.length) {
      setSpeakingIds([]);
      return;
    }

    const activeParticipants = participants.filter(
      (participant) => participant?.stream?.getAudioTracks?.().length
    );

    if (!activeParticipants.length) {
      setSpeakingIds([]);
      return;
    }

    const audioContext = new AudioContextClass();
    const analysers = activeParticipants.map((participant) => {
      const source = audioContext.createMediaStreamSource(participant.stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);

      return {
        userId: String(participant.userId),
        analyser,
        source,
        data: new Uint8Array(analyser.frequencyBinCount),
      };
    });

    let frameId = null;
    let stopped = false;

    const tick = () => {
      if (stopped) return;

      const nextSpeaking = [];

      analysers.forEach(({ userId, analyser, data }) => {
        analyser.getByteFrequencyData(data);
        const average =
          data.reduce((sum, value) => sum + value, 0) / Math.max(data.length, 1);

        if (average > THRESHOLD) {
          nextSpeaking.push(userId);
        }
      });

      setSpeakingIds(nextSpeaking);
      frameId = window.setTimeout(tick, 260);
    };

    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    tick();

    return () => {
      stopped = true;
      if (frameId) {
        clearTimeout(frameId);
      }
      analysers.forEach(({ source }) => source.disconnect());
      audioContext.close().catch(() => {});
    };
  }, [participants]);

  return speakingIds;
};

export default useSpeakingParticipants;

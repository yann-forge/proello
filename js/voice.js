// Dictée vocale via l'API Web Speech du navigateur (Chrome, Edge, Safari, Android).
// La reconnaissance redémarre automatiquement après un silence tant que l'utilisateur n'a pas appuyé sur « Terminer ».

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = !!SR;

const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Ajoute un segment en évitant les doublons (Chrome Android renvoie parfois des résultats cumulés). */
function pushDedup(list, seg) {
  const last = list[list.length - 1];
  if (last && norm(seg).startsWith(norm(last))) list[list.length - 1] = seg;
  else if (!last || !norm(last).startsWith(norm(seg))) list.push(seg);
}

export const VOICE_ERRORS = {
  'not-allowed': "L'accès au micro a été refusé. Autorise-le dans les réglages du navigateur.",
  'service-not-allowed': "La dictée n'est pas autorisée dans ce mode. Essaie depuis le navigateur.",
  'audio-capture': 'Aucun micro détecté.',
  network: 'La dictée a besoin d’une connexion internet.',
  'language-not-supported': 'Le français n’est pas disponible pour la dictée sur cet appareil.',
};

export function startDictation({ onUpdate, onError }) {
  const rec = new SR();
  rec.lang = 'fr-FR';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  const committed = []; // segments des sessions précédentes
  let sessionFinals = [];
  let interim = '';
  let active = true;
  let restarts = 0;
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));

  const fullText = () => [...committed, ...sessionFinals].join(' ').replace(/\s+/g, ' ').trim();

  rec.onresult = (e) => {
    const finals = [];
    interim = '';
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      const t = r[0].transcript.trim();
      if (!t) continue;
      if (r.isFinal) pushDedup(finals, t);
      else interim += ' ' + t;
    }
    sessionFinals = finals;
    onUpdate?.(fullText(), interim.trim());
  };

  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    active = false;
    onError?.(e.error);
  };

  rec.onend = () => {
    sessionFinals.forEach((s) => pushDedup(committed, s));
    sessionFinals = [];
    if (active && restarts++ < 60) {
      try {
        rec.start();
        return;
      } catch {
        /* ignore : on termine */
      }
    }
    // si aucun résultat final n'est arrivé, on garde le texte provisoire
    if (interim) pushDedup(committed, interim.trim());
    interim = '';
    resolveDone(fullText());
  };

  rec.start();

  return {
    done,
    stop() {
      active = false;
      try {
        rec.stop();
      } catch {
        resolveDone(fullText());
      }
      return done;
    },
    cancel() {
      active = false;
      interim = '';
      committed.length = 0;
      sessionFinals = [];
      try {
        rec.abort();
      } catch {
        /* déjà arrêtée */
      }
      resolveDone('');
    },
  };
}

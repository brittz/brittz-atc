// ============================================================
// Fraseologia radiotelefônica (callsigns) — camada de comunicação
// A engine continua com IDs textuais (GLO1234); só o rádio/TTS usa isto.
// ============================================================
'use strict';

const RadioPhrase = (() => {
  const ICAO = {
    A: 'Alpha', B: 'Bravo', C: 'Charlie', D: 'Delta', E: 'Echo', F: 'Foxtrot',
    G: 'Golf', H: 'Hotel', I: 'India', J: 'Juliett', K: 'Kilo', L: 'Lima',
    M: 'Mike', N: 'November', O: 'Oscar', P: 'Papa', Q: 'Quebec', R: 'Romeo',
    S: 'Sierra', T: 'Tango', U: 'Uniform', V: 'Victor', W: 'Whiskey', X: 'X-ray',
    Y: 'Yankee', Z: 'Zulu',
  };

  const DIGITS = {
    pt: {
      0: 'zero', 1: 'um', 2: 'dois', 3: 'três', 4: 'quatro',
      5: 'cinco', 6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove',
    },
    en: {
      0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four',
      5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'niner',
    },
  };

  // operadores extras não listados em DATA.AIRLINES (expansível)
  const EXTRA_OPS = [
    { code: 'FAB', radio: 'Força Aérea' },
  ];

  function digitWord(d, lang) {
    const table = DIGITS[lang] || DIGITS.pt;
    const w = table[d] || String(d);
    return w.charAt(0).toUpperCase() + w.slice(1);
  }

  function spellChar(ch, lang) {
    const c = String(ch).toUpperCase();
    if (/\d/.test(c)) return digitWord(c, lang);
    return ICAO[c] || c;
  }

  function operators() {
    const list = (typeof DATA !== 'undefined' && Array.isArray(DATA.AIRLINES))
      ? DATA.AIRLINES.slice() : [];
    for (const op of EXTRA_OPS) {
      if (!list.some(a => a.code === op.code)) list.push(op);
    }
    return list.sort((a, b) => b.code.length - a.code.length);
  }

  function findAirline(cs) {
    const u = String(cs || '').toUpperCase();
    for (const a of operators()) {
      if (!u.startsWith(a.code)) continue;
      const rest = u.slice(a.code.length);
      if (rest && /^\d/.test(rest)) return { code: a.code, radio: a.radio, rest };
    }
    return null;
  }

  function isRegistration(cs) {
    const u = String(cs || '').toUpperCase();
    return /^[A-Z]{1,2}-[A-Z0-9]+$/.test(u);
  }

  function speakDigits(s, lang) {
    return String(s).split('').map(c =>
      /\d/.test(c) ? digitWord(c, lang) : spellChar(c, lang)
    ).join(' ');
  }

  /**
   * Converte callsign interno → forma radiotelefônica.
   * opts.radio: nome já conhecido da aeronave (ac.radio), preferido para operador.
   * opts.lang: 'pt' | 'en' (padrão 'pt').
   */
  function speakCallsign(cs, opts) {
    opts = opts || {};
    const lang = opts.lang === 'en' ? 'en' : 'pt';
    const u = String(cs || '').toUpperCase().replace(/\s+/g, '');
    if (!u) return '';

    // Matrícula / identificador com hífen → alfabeto ICAO + dígitos
    if (isRegistration(u)) {
      return u.replace(/-/g, '').split('').map(c => spellChar(c, lang)).join(' ');
    }

    const al = findAirline(u);
    if (al) {
      const name = (opts.radio && opts.radio !== u) ? opts.radio : al.radio;
      return (name + ' ' + speakDigits(al.rest, lang)).trim();
    }

    // Letras + números sem operador conhecido: soletra prefixo (ICAO) + dígitos
    const m = u.match(/^([A-Z]+)(\d+)$/);
    if (m) {
      if (opts.radio && opts.radio !== u && opts.radio !== m[1]) {
        return (opts.radio + ' ' + speakDigits(m[2], lang)).trim();
      }
      return (m[1].split('').map(c => spellChar(c, lang)).join(' ') + ' ' + speakDigits(m[2], lang)).trim();
    }

    return u.replace(/-/g, '').split('').map(c => spellChar(c, lang)).join(' ');
  }

  return {
    speakCallsign,
    spellChar,
    digitWord,
    findAirline,
    isRegistration,
    ICAO,
    DIGITS,
  };
})();

if (typeof globalThis !== 'undefined') globalThis.RadioPhrase = RadioPhrase;
if (typeof module !== 'undefined') module.exports = { RadioPhrase };

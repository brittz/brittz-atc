// ============================================================
// VoicePhrase — conversão fonética para TTS (radiotelefonia BR)
// Etapa 3 da cadeia: mensagem → fraseologia → fonética → síntese.
// NÃO altera textos do log/engine; só o que vai para speechSynthesis.
// ============================================================
'use strict';

const VoicePhrase = (() => {
  const SIDE = { L: 'Esquerda', R: 'Direita', C: 'Centro' };

  const ABBR = [
    [/\bFL\b/g, 'Flight Level'],
    [/\bDCT\b/gi, 'Direct'],
    [/\bILS\b/g, 'I L S'],
    [/\bVOR\b/g, 'V O R'],
    [/\bRNAV\b/gi, 'R Nav'],
    [/\bVFR\b/g, 'V F R'],
    [/\bIFR\b/g, 'I F R'],
    [/\bATZ\b/g, 'A T Z'],
    [/\bTMA\b/g, 'T M A'],
    [/\bSID\b/g, 'SID'],
    [/\bSTAR\b/g, 'STAR'],
    [/\bRTO\b/g, 'R T O'],
    [/\bNM\b/g, 'milhas náuticas'],
  ];

  function digitWord(d) {
    // Reutiliza a tabela BR de RadioPhrase quando disponível
    if (typeof RadioPhrase !== 'undefined' && RadioPhrase.digitWord) {
      return RadioPhrase.digitWord(d, 'pt');
    }
    const t = {
      0: 'Zero', 1: 'Uno', 2: 'Dois', 3: 'Três', 4: 'Quatro',
      5: 'Cinco', 6: 'Meia', 7: 'Sete', 8: 'Oito', 9: 'Nove',
    };
    return t[d] || String(d);
  }

  function speakDigits(s) {
    return String(s).replace(/\D/g, '').split('').map(digitWord).join(' ');
  }

  function speakRunway(num, side) {
    const s = SIDE[String(side).toUpperCase()] || String(side);
    return (speakDigits(num) + ' ' + s).trim();
  }

  /**
   * Converte texto de rádio → forma segura para TTS (pt-BR aeronáutico).
   * opts.lang reservado para expansões futuras (FAA etc.).
   */
  function forTts(text, opts) {
    opts = opts || {};
    let s = String(text == null ? '' : text);
    if (!s) return '';

    // Identificação de asa rotativa (nunca “Helicóptero” no rádio)
    s = s.replace(/\b[Hh]elic[oó]pteros?\b/g, 'Asa Rotativa');

    // FL160 / FL 160
    s = s.replace(/\bFL\s*(\d{2,3})\b/gi, (_, n) => 'Flight Level ' + speakDigits(n));

    // Pistas 09L / 09R / 18C (antes de dígitos genéricos)
    s = s.replace(/\b(\d{2})([LRC])\b/gi, (_, num, side) => speakRunway(num, side));

    // Milhares pt-BR: 2.000 → Dois Zero Zero Zero (não “Decimal”)
    s = s.replace(/\b(\d{1,3}(?:\.\d{3})+)\b/g, (_, n) => speakDigits(n.replace(/\./g, '')));

    // Frequências / decimais: 109.90
    s = s.replace(/\b(\d+)\.(\d+)\b/g, (_, a, b) =>
      speakDigits(a) + ' Decimal ' + speakDigits(b));

    // Números restantes ainda em dígitos
    s = s.replace(/\b(\d+)\b/g, (_, n) => speakDigits(n));

    // Abreviações operacionais
    for (const [re, rep] of ABBR) s = s.replace(re, rep);

    // Colapsa espaços
    return s.replace(/\s+/g, ' ').trim();
  }

  return {
    forTts,
    speakDigits,
    speakRunway,
    digitWord,
    SIDE,
  };
})();

if (typeof globalThis !== 'undefined') globalThis.VoicePhrase = VoicePhrase;
if (typeof module !== 'undefined') module.exports = { VoicePhrase };

/**
 * AI Assistant — Text-to-Speech Engine Module (Browser / Client-Side)
 * ==================================================================
 * Wraps window.speechSynthesis and SpeechSynthesisUtterance with:
 *   - Auto-cancellation of previous speech
 *   - en-US language default
 *   - 5000-character truncation protection
 *   - Graceful fallback when SpeechSynthesis is unavailable
 *   - Completion and error callbacks
 */

const MAX_SPEECH_LENGTH = 5000;
const DEFAULT_LANG = 'en-US';

/**
 * Checks if SpeechSynthesis is supported in the current environment.
 * @returns {boolean}
 */
export function isTtsSupported() {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

/**
 * Speaks the given text using browser SpeechSynthesis.
 *
 * @param {string} text - Text to speak
 * @param {object|function} [optionsOrCallback] - Configuration object or onEnd callback
 * @param {function} [maybeOnError] - Optional onError callback if second param was onEnd
 * @returns {boolean} Whether speech was initiated
 */
export function speak(text, optionsOrCallback = {}, maybeOnError = null) {
  if (!isTtsSupported()) {
    const err = new Error('Speech synthesis is not supported in this browser.');
    if (typeof optionsOrCallback === 'function' && typeof maybeOnError === 'function') {
      maybeOnError(err);
    } else if (typeof optionsOrCallback?.onError === 'function') {
      optionsOrCallback.onError(err);
    }
    return false;
  }

  if (typeof text !== 'string' || text.trim() === '') {
    return false;
  }

  // Normalize options
  let options = {};
  if (typeof optionsOrCallback === 'function') {
    options = {
      onEnd: optionsOrCallback,
      onError: maybeOnError,
    };
  } else if (optionsOrCallback && typeof optionsOrCallback === 'object') {
    options = optionsOrCallback;
  }

  // Cancel any ongoing or queued speech before starting new speech
  try {
    window.speechSynthesis.cancel();
  } catch (_) {
    // Ignore cancellation errors
  }

  // Truncate extremely long text to 5000 characters
  let speechText = text;
  if (speechText.length > MAX_SPEECH_LENGTH) {
    speechText = speechText.slice(0, MAX_SPEECH_LENGTH);
  }

  try {
    const utterance = new window.SpeechSynthesisUtterance(speechText);
    utterance.lang = options.lang || DEFAULT_LANG;

    if (typeof options.rate === 'number') {
      utterance.rate = options.rate;
    }
    if (typeof options.pitch === 'number') {
      utterance.pitch = options.pitch;
    }

    utterance.onstart = (event) => {
      options.onStart?.(event);
    };

    utterance.onend = (event) => {
      options.onEnd?.(event);
    };

    utterance.onerror = (event) => {
      options.onError?.(event);
    };

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (err) {
    options.onError?.(err);
    return false;
  }
}

/**
 * Immediately stops any currently playing or pending speech.
 */
export function stopSpeaking() {
  if (isTtsSupported()) {
    try {
      window.speechSynthesis.cancel();
    } catch (_) {
      // Ignore cancellation errors
    }
  }
}

/**
 * Returns true if the synthesizer is currently speaking or has speech in queue.
 * @returns {boolean}
 */
export function isSpeaking() {
  if (isTtsSupported()) {
    try {
      return !!window.speechSynthesis.speaking;
    } catch (_) {
      return false;
    }
  }
  return false;
}

export { stopSpeaking as cancel };

const ttsEngine = {
  speak,
  stopSpeaking,
  cancel: stopSpeaking,
  isSpeaking,
  isTtsSupported,
};

export default ttsEngine;

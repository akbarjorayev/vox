// Hand-picked voices for the settings dialog and page. Any valid voice name
// still works from the command line; this list is only what is offered.
const CHOICES = [
  { id: 'en-US-AriaNeural', name: 'Aria', language: 'English (US)', gender: 'female' },
  { id: 'en-US-JennyNeural', name: 'Jenny', language: 'English (US)', gender: 'female' },
  { id: 'en-US-GuyNeural', name: 'Guy', language: 'English (US)', gender: 'male' },
  { id: 'en-GB-SoniaNeural', name: 'Sonia', language: 'English (UK)', gender: 'female' },
  { id: 'en-GB-RyanNeural', name: 'Ryan', language: 'English (UK)', gender: 'male' },
  { id: 'en-AU-NatashaNeural', name: 'Natasha', language: 'English (Australia)', gender: 'female' },
  { id: 'uz-UZ-MadinaNeural', name: 'Madina', language: 'Uzbek', gender: 'female' },
  { id: 'uz-UZ-SardorNeural', name: 'Sardor', language: 'Uzbek', gender: 'male' },
  { id: 'ru-RU-SvetlanaNeural', name: 'Svetlana', language: 'Russian', gender: 'female' },
  { id: 'ru-RU-DmitryNeural', name: 'Dmitry', language: 'Russian', gender: 'male' },
];

// `label` is the one-line form, for places that cannot lay out columns.
export const VOICES = Object.freeze(
  CHOICES.map((voice) => Object.freeze({ ...voice, label: `${voice.name} · ${voice.language} · ${voice.gender}` })),
);

// The offline voices only come as female or male. A voice vox does not list
// is read by a female one, matching the default voice.
export function genderOf(voiceId) {
  return VOICES.find((voice) => voice.id === voiceId)?.gender ?? 'female';
}

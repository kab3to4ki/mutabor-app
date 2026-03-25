import React, { useState, useRef, useEffect, useCallback } from 'react'

const ANIMALS = {
  dog:     { emoji: '🐕', name: 'Собака',  voice: 'fable',   sounds: 'ГАВ! ВУФ ВУФ! АРФ!',         pitch: 1.4 },
  cat:     { emoji: '🐱', name: 'Кошка',   voice: 'nova',    sounds: 'МЯУ! МРРРР... МЯУ МЯУ!',     pitch: 1.3 },
  bird:    { emoji: '🐦', name: 'Птица',   voice: 'shimmer', sounds: 'ЧИРИК! ЧИВ ЧИВ! ТИРЛИР!',    pitch: 1.6 },
  cow:     { emoji: '🐄', name: 'Корова',  voice: 'onyx',    sounds: 'МУ-У-У! МУ! МООО!',           pitch: 0.75 },
  frog:    { emoji: '🐸', name: 'Лягушка', voice: 'alloy',   sounds: 'КВА! КВА КВА! КВАААА!',       pitch: 0.95 },
  wolf:    { emoji: '🐺', name: 'Волк',    voice: 'echo',    sounds: 'У-У-У-У! ВЫЙ! АРРР У-У!',    pitch: 0.8 },
  dolphin: { emoji: '🐬', name: 'Дельфин', voice: 'shimmer', sounds: 'ЭЭЭ! ЕЕЕЕЕ! ИИИ ЭЭЭ ИИИ!',  pitch: 1.5 },
  bear:    { emoji: '🐻', name: 'Медведь', voice: 'onyx',    sounds: 'РРРР! ГРРР! УРРР РРРР!',      pitch: 0.65 },
}

const API_KEY = import.meta.env.VITE_OPENAI_API_KEY

function App() {
  const [mode, setMode] = useState('animal-to-human') // 'animal-to-human' or 'human-to-animal'
  const [selectedAnimal, setSelectedAnimal] = useState('dog')
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [transcription, setTranscription] = useState('')
  const [translation, setTranslation] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [error, setError] = useState('')
  const [animalForTranscription, setAnimalForTranscription] = useState('dog')

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const audioPlayRef = useRef(null)

  const startRecording = useCallback(async () => {
    try {
      setError('')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      setError('Не удалось получить доступ к микрофону. Проверьте разрешения.')
    }
  }, [])

  const processAudioRef = useRef(null)

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current) return

    setIsRecording(false)
    mediaRecorderRef.current.stop()

    setTimeout(() => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
      if (processAudioRef.current) processAudioRef.current(audioBlob)
    }, 100)
  }, [])

  const processAudio = useCallback(async (audioBlob) => {

    setIsLoading(true)
    setTranscription('')
    setTranslation('')
    setError('')

    try {
      // Transcribe with Whisper
      const formData = new FormData()
      formData.append('file', audioBlob, 'recording.webm')
      formData.append('model', 'whisper-1')
      formData.append('response_format', 'text')

      const transcribeResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`
        },
        body: formData
      })

      if (!transcribeResponse.ok) {
        throw new Error('Ошибка при транскрипции. Проверьте API ключ.')
      }

      const transcribedText = await transcribeResponse.text()
      setTranscription(transcribedText)

      // Translate with GPT
      const animalName = mode === 'animal-to-human'
        ? ANIMALS[animalForTranscription].name
        : ANIMALS[selectedAnimal].name
      const personality = mode === 'animal-to-human'
        ? ''
        : ANIMALS[selectedAnimal].personality

      let systemPrompt, userMessage

      if (mode === 'animal-to-human') {
        systemPrompt = `Ты переводчик языка животных. Тебе дали запись звуков животного "${animalName}". Дай ОЧЕНЬ КОРОТКИЙ перевод — максимум 3-6 слов, без предисловий. Только суть того, что животное хотело сказать. Например: "Дай поесть!", "Уйди от меня!", "Играй со мной!", "Чужой! Атас!". Смешно, метко, по делу.`
        userMessage = transcribedText || `[звуки ${animalName}]`
      } else {
        const animalSounds = ANIMALS[selectedAnimal].sounds
        systemPrompt = `Ты переводчик на язык животного "${animalName}". Переведи слова человека в ЗВУКИ этого животного — только звукоподражания, никаких слов. Используй звуки вроде: ${animalSounds}. Генерируй достаточно звуков чтобы передать смысл и эмоцию — минимум 8-12 звуковых токенов, растяни на полноценную фразу. Только звуки, ничего лишнего.`
        userMessage = transcribedText || '[человек что-то сказал]'
      }

      const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          max_tokens: 200,
          temperature: 0.8
        })
      })

      if (!gptResponse.ok) {
        throw new Error('Ошибка при переводе. Проверьте API ключ.')
      }

      const gptData = await gptResponse.json()
      const translatedText = gptData.choices[0].message.content

      setTranslation(translatedText)

      // Generate speech for both modes — pass current animal key explicitly
      if (mode === 'human-to-animal') {
        generateAnimalSpeech(translatedText, selectedAnimal)
      } else {
        generateHumanSpeech(translatedText)
      }
    } catch (err) {
      setError(err.message || 'Ошибка при обработке аудио')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [mode, selectedAnimal, animalForTranscription])

  // Keep ref updated so stopRecording always calls the latest version
  useEffect(() => {
    processAudioRef.current = processAudio
  }, [processAudio])

  // Human voice reads back animal translation
  const generateHumanSpeech = useCallback(async (text) => {
    try {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts-1', input: text, voice: 'alloy', speed: 1.0 })
      })
      if (!res.ok) throw new Error('Ошибка озвучки')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      const audio = new Audio(url)
      await audio.play()
    } catch (err) {
      setError(err.message || 'Ошибка при озвучке перевода')
    }
  }, [])

  // Animal voice: TTS + pitch shift — animalKey passed explicitly to avoid stale closure
  const generateAnimalSpeech = useCallback(async (text, animalKey) => {
    try {
      const animal = ANIMALS[animalKey]
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts-1', input: text, voice: animal.voice, speed: 1.0 })
      })
      if (!res.ok) throw new Error('Ошибка при создании аудио')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)
      const audio = new Audio(url)
      audio.playbackRate = animal.pitch
      await audio.play()
    } catch (err) {
      setError(err.message || 'Ошибка при создании аудио')
    }
  }, [])

  const playAudio = useCallback((currentAnimalKey, currentMode, currentUrl) => {
    if (!currentUrl) return
    const audio = new Audio(currentUrl)
    if (currentMode === 'human-to-animal') {
      audio.playbackRate = ANIMALS[currentAnimalKey].pitch
    }
    audio.play()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-auto">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 max-w-2xl mx-auto p-6">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent mb-2">
            🎙️ МУТАБОР
          </h1>
          <p className="text-slate-400 text-sm tracking-widest uppercase">
            Переводчик языка животных
          </p>
        </div>


        {/* Mode Selection */}
        <div className="flex gap-4 mb-8 justify-center">
          <button
            onClick={() => {
              setMode('animal-to-human')
              setTranscription('')
              setTranslation('')
              setError('')
            }}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all border transform hover:scale-105 ${
              mode === 'animal-to-human'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 border-emerald-400 shadow-lg shadow-emerald-500/50'
                : 'bg-slate-700/50 border-slate-600 hover:border-slate-500'
            }`}
          >
            🐾 Животное → Человек
          </button>
          <button
            onClick={() => {
              setMode('human-to-animal')
              setTranscription('')
              setTranslation('')
              setError('')
              setAudioUrl('')
            }}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all border transform hover:scale-105 ${
              mode === 'human-to-animal'
                ? 'bg-gradient-to-r from-cyan-500 to-teal-500 border-cyan-400 shadow-lg shadow-cyan-500/50'
                : 'bg-slate-700/50 border-slate-600 hover:border-slate-500'
            }`}
          >
            👤 Человек → Животное
          </button>
        </div>

        {/* Animal Selection (for Human → Animal) */}
        {mode === 'human-to-animal' && (
          <div className="mb-8">
            <label className="block text-sm text-slate-300 mb-4 text-center font-semibold">
              Выбери животное 👇
            </label>
            <div className="grid grid-cols-4 gap-3">
              {Object.entries(ANIMALS).map(([key, animal]) => (
                <button
                  key={key}
                  onClick={() => setSelectedAnimal(key)}
                  className={`p-3 rounded-lg transition-all transform hover:scale-110 border-2 ${
                    selectedAnimal === key
                      ? 'bg-gradient-to-br from-emerald-500/40 to-teal-500/40 border-emerald-400 shadow-lg shadow-emerald-500/40'
                      : 'bg-slate-700/50 border-slate-600/50 hover:border-slate-500'
                  }`}
                  title={animal.name}
                >
                  <div className="text-2xl mb-1">{animal.emoji}</div>
                  <div className="text-xs text-slate-300">{animal.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Animal Selection (for Animal → Human) */}
        {mode === 'animal-to-human' && (
          <div className="mb-8">
            <label className="block text-sm text-slate-300 mb-4 text-center font-semibold">
              Какое животное слышишь? 👂
            </label>
            <div className="grid grid-cols-4 gap-3">
              {Object.entries(ANIMALS).map(([key, animal]) => (
                <button
                  key={key}
                  onClick={() => setAnimalForTranscription(key)}
                  className={`p-3 rounded-lg transition-all transform hover:scale-110 border-2 ${
                    animalForTranscription === key
                      ? 'bg-gradient-to-br from-emerald-500/40 to-teal-500/40 border-emerald-400 shadow-lg shadow-emerald-500/40'
                      : 'bg-slate-700/50 border-slate-600/50 hover:border-slate-500'
                  }`}
                  title={animal.name}
                >
                  <div className="text-2xl mb-1">{animal.emoji}</div>
                  <div className="text-xs text-slate-300">{animal.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Record Button */}
        <div className="flex justify-center mb-8">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isLoading}
            className={`relative w-32 h-32 rounded-full font-bold text-lg transition-all transform hover:scale-110 ${
              isRecording
                ? 'bg-gradient-to-r from-red-500 to-pink-500 shadow-2xl shadow-red-500/60 animate-pulse'
                : isLoading
                ? 'bg-gradient-to-r from-slate-600 to-slate-700 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-2xl shadow-emerald-500/60 hover:shadow-emerald-500/80'
            }`}
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin">⏳</div>
              </div>
            ) : isRecording ? (
              <div className="flex flex-col items-center justify-center h-full gap-1">
                <div className="text-2xl animate-pulse">🔴</div>
                <span className="text-xs">СТОП</span>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-1">
                <div className="text-2xl">🎙️</div>
                <span className="text-xs">ЗАПИСЬ</span>
              </div>
            )}

            {/* Pulsing outer ring */}
            {!isLoading && (
              <div
                className="absolute inset-0 rounded-full border-2 border-emerald-400/50 animate-pulse"
                style={{
                  animation: isRecording
                    ? 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                    : 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                }}
              ></div>
            )}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6 animate-in fade-in-50">
            <p className="text-red-200 text-sm">⚠️ {error}</p>
          </div>
        )}

        {/* Results */}
        {(transcription || translation) && (
          <div className="space-y-6 mb-8">
            {/* Translation */}
            {translation && (
              <div className="bg-gradient-to-br from-emerald-500/20 to-teal-500/10 backdrop-blur-sm border border-emerald-500/30 rounded-lg p-6 shadow-lg shadow-emerald-500/20">
                <h3 className="text-sm font-semibold text-emerald-300 mb-2 uppercase tracking-wider">
                  ✨ Перевод
                </h3>
                <p className="text-white text-lg leading-relaxed">{translation}</p>

                {/* Replay button — both modes */}
                {audioUrl && (
                  <button
                    onClick={() => playAudio(selectedAnimal, mode, audioUrl)}
                    className="mt-4 px-6 py-2 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-600 hover:to-teal-600 rounded-lg font-semibold transition-all transform hover:scale-105 shadow-lg shadow-cyan-500/30"
                  >
                    🔊 {mode === 'human-to-animal' ? `Голос ${ANIMALS[selectedAnimal].name}` : 'Слушать перевод'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Audio Player (hidden) */}
        <audio ref={audioPlayRef} src={audioUrl} />

        {/* Footer */}
        <div className="text-center text-slate-500 text-xs mt-12 pb-6">
          <p>Мутабор © 2026 • Animal Voice Translator</p>
        </div>
      </div>
    </div>
  )
}

export default App

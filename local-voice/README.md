# Optional Windows microphone transcription

LifeCast uses a local `whisper.cpp` executable for English microphone transcription on Windows. The executable, DLLs and model are intentionally excluded from Git. The current UI uses typed Bedrock chat and optional Polly intake speech; it does not record a microphone. These runtime files are only needed when using the retained local transcription API.

1. Download a Windows x64 CPU build from the official [whisper.cpp releases](https://github.com/ggml-org/whisper.cpp/releases). Extract `whisper-cli.exe` and all DLLs distributed alongside it into `local-voice/bin/`.
2. Download the unquantized `ggml-tiny.en.bin` model from the [whisper.cpp model repository](https://huggingface.co/ggerganov/whisper.cpp/tree/main) and place it directly inside `local-voice/`.
3. Restart LifeCast with `npm start`. The backend's `/api/status` response reports `transcriptionReady: true` when the expected executable and model files exist on Windows. A recording verifies whether the runtime can execute successfully.

Expected layout:

```text
local-voice/
  README.md
  LICENSE-whisper-cpp.txt
  LICENSE-whisper-model.txt
  ggml-tiny.en.bin
  bin/
    whisper-cli.exe
    whisper.dll
    ggml.dll
    ...other DLLs from the same release
```

Keep executable and DLL versions together. See the upstream [build instructions](https://github.com/ggml-org/whisper.cpp#quick-start) if building the runtime yourself. This integration currently invokes the Windows executable; it does not automatically install or configure native macOS or Linux transcription.

Windows speech synthesis is separate: when Polly fails, the app can use an installed English Windows SAPI voice through Windows PowerShell. That fallback does not require Whisper. Browser microphone permission and audio playback permission are still required for a voice conversation.

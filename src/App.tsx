import React, { useState, useRef, useEffect } from 'react';
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
// No need for separate import if using CDN, but local is safer for Electron
import { Upload, Play, Pause, Square, Volume2, FileText, Loader2, AlertCircle } from 'lucide-react';
import './App.css';

// Set up PDF.js worker using a standard CDN path that is more reliable or local bundle
// For Vite apps, it's best to use this pattern:
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isReading, setIsReading] = useState(false);
  const [status, setStatus] = useState('Welcome to Vaanavil. Please upload a Tamil or English document to begin.');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Initialize voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      
      // Prefer Tamil voice if available
      const tamilVoice = availableVoices.find(v => v.lang.includes('ta'));
      // Fallback to English voice
      const englishVoice = availableVoices.find(v => v.lang.includes('en'));
      
      if (tamilVoice) setSelectedVoice(tamilVoice);
      else if (englishVoice) setSelectedVoice(englishVoice);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setOcrText('');
      setStatus(`File chosen: ${uploadedFile.name}. Click "Start Extraction" to read the text.`);
    }
  };

  const processFile = async () => {
    if (!file) return;
    setIsProcessing(true);
    setStatus('Initializing OCR engine...');
    setProgress(0);

    let worker: Tesseract.Worker | null = null;
    try {
      // Initialize worker with both Tamil and English support
      worker = await createWorker(['tam', 'eng']);
      
      let combinedText = '';
      if (file.type === 'application/pdf') {
        setStatus('Reading PDF document...');
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        for (let i = 1; i <= pdf.numPages; i++) {
          setStatus(`Processing PDF page ${i} of ${pdf.numPages}...`);
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          
          if (!context) throw new Error('Could not create canvas context');
          
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context, viewport }).promise;
          
          setStatus(`Extracting text from page ${i}...`);
          const { data: { text } } = await worker.recognize(canvas);
          combinedText += text + '\n\n';
          
          setProgress((i / pdf.numPages) * 100);
        }
      } else {
        // Image processing
        setStatus('Extracting text from image...');
        const imageUrl = URL.createObjectURL(file);
        const { data: { text } } = await worker.recognize(imageUrl);
        combinedText = text;
        setProgress(100);
      }

      setOcrText(combinedText);
      setIsProcessing(false);
      setStatus('Success! The text has been extracted. You can now use the reading controls.');
      
      const announcement = document.getElementById('sr-announcement');
      if (announcement) announcement.innerText = 'Text extraction complete. Use the Play button to start reading.';
    } catch (error) {
      console.error('OCR/PDF processing error:', error);
      setIsProcessing(false);
      setStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}. Please ensure it is a valid PDF or image.`);
    } finally {
      if (worker) {
        await worker.terminate();
      }
    }
  };

  const toggleReading = () => {
    if (isReading) {
      window.speechSynthesis.pause();
      setIsReading(false);
      setStatus('Reading paused.');
    } else {
      if (window.speechSynthesis.paused && utteranceRef.current) {
        window.speechSynthesis.resume();
      } else {
        if (!ocrText) return;
        const utterance = new SpeechSynthesisUtterance(ocrText);
        
        // Auto-detect language or default to Tamil/English
        // For simplicity, we use selectedVoice which was picked based on available voices
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          utterance.lang = selectedVoice.lang;
        } else {
          utterance.lang = 'ta-IN';
        }
        
        utterance.onend = () => {
          setIsReading(false);
          setStatus('Reading finished.');
        };

        utteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      }
      setIsReading(true);
      setStatus('Reading aloud...');
    }
  };

  const stopReading = () => {
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setIsReading(false);
    setStatus('Reading stopped.');
  };

  return (
    <div className="app-container">
      <header role="banner" className="header">
        <h1 className="title">வானவில் (Vaanavil)</h1>
        <p className="subtitle">Accessible Tamil & English Reader</p>
      </header>

      <main id="main-content" role="main" className="main">
        <div id="sr-announcement" className="sr-only" aria-live="assertive"></div>

        <section className="controls-section" aria-labelledby="upload-heading">
          <h2 id="upload-heading" className="sr-only">Upload and Controls</h2>
          
          <div className="card upload-card">
            <label htmlFor="file-upload" className="upload-label">
              <Upload className="icon" />
              <span>{file ? 'Change File' : 'Upload Book (Image or PDF)'}</span>
              <input 
                id="file-upload" 
                type="file" 
                accept="image/*,application/pdf" 
                onChange={handleFileUpload}
                className="sr-only"
              />
            </label>
            {file && <p className="file-info" aria-live="polite">Chosen: {file.name}</p>}
            
            <button 
              onClick={processFile} 
              disabled={!file || isProcessing}
              className="primary-button"
              aria-label="Start text extraction"
            >
              {isProcessing ? <Loader2 className="icon animate-spin" /> : <FileText className="icon" />}
              {isProcessing ? 'Processing...' : 'Start Extraction'}
            </button>
          </div>

          <div className="status-box" aria-live="polite">
            <p className="status-text">{status}</p>
            {isProcessing && (
              <div className="progress-bar-bg" aria-hidden="true">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
              </div>
            )}
          </div>

          <div className="reading-controls">
            <button 
              onClick={toggleReading} 
              disabled={!ocrText || isProcessing}
              className="control-button"
              aria-label={isReading ? "Pause reading" : "Start reading aloud"}
            >
              {isReading ? <Pause /> : <Play />}
            </button>
            <button 
              onClick={stopReading} 
              disabled={!ocrText || isProcessing}
              className="control-button"
              aria-label="Stop reading"
            >
              <Square />
            </button>
          </div>
        </section>

        <section className="text-display-section" aria-labelledby="result-heading">
          <h2 id="result-heading" className="section-title">Extracted Text</h2>
          <div className="card text-card" role="region" aria-label="Extracted content" tabIndex={0}>
            {ocrText ? (
              <p className="extracted-text">{ocrText}</p>
            ) : (
              <p className="placeholder-text">The extracted text will appear here...</p>
            )}
          </div>
        </section>
      </main>

      <footer role="contentinfo" className="footer">
        <p>&copy; 2024 Vaanavil - Built for Accessibility</p>
      </footer>
    </div>
  );
}

export default App;

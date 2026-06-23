import { useState, useRef, useCallback, useEffect } from 'react';

export interface AudioRecorderOptions {
  fileName?: string;
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<PermissionState | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' as PermissionName })
        .then(result => {
          setPermissionState(result.state);
          result.onchange = () => setPermissionState(result.state);
        })
        .catch(() => {});
    }
  }, []);

  const isSupported = typeof window !== 'undefined' && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia;

  const startRecording = useCallback(async (fileName: string = 'recording') => {
    if (isRecording || isInitializing) return;

    if (!isSupported) {
      setStatusMessage('Browser Not Supported');
      return;
    }

    let stream: MediaStream | null = null;
    try {
      setStatusMessage('Requesting Mic...');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      setIsInitializing(true);
      if (typeof MediaRecorder === 'undefined') {
        setStatusMessage('No MediaRecorder');
        stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        setIsInitializing(false);
        return;
      }
      
      setStatusMessage(null);
      // Check for supported types
      const mimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/aac'];
      const supportedType = mimeTypes.find(type => {
        try {
          return MediaRecorder.isTypeSupported(type);
        } catch (e) {
          return false;
        }
      });
      
      const mediaRecorder = new MediaRecorder(stream, supportedType ? { mimeType: supportedType } : undefined);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      const localStream = stream;
      mediaRecorder.onstop = () => {
        try {
          const mimeType = mediaRecorder.mimeType || 'audio/webm';
          const extension = mimeType.split('/')[1]?.split(';')[0] || 'webm';
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          const url = URL.createObjectURL(audioBlob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `${fileName}.${extension}`;
          document.body.appendChild(a);
          a.click();
          
          // Cleanup
          setTimeout(() => {
            if (document.body.contains(a)) document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }, 500);
        } catch (err) {
          console.error('Error in onstop callback:', err);
        } finally {
          localStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        }
      };

      mediaRecorder.onerror = (event: any) => {
        console.error('MediaRecorder error:', event.error);
        setStatusMessage('Recorder Error');
        setIsRecording(false);
        setTimeout(() => setStatusMessage(null), 3000);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setIsInitializing(false);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error: any) {
      setIsInitializing(false);
      console.error('Recording setup error:', error);
      setStatusMessage(error.name || 'Setup Error');
      setIsRecording(false);
      if (stream) {
        stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      }
      setTimeout(() => setStatusMessage(null), 5000);
    }
  }, [isRecording, isInitializing, isSupported]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsInitializing(false);
      setStatusMessage(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return {
    isRecording,
    isInitializing,
    statusMessage,
    permissionState,
    isSupported,
    recordingTime,
    startRecording,
    stopRecording
  };
}

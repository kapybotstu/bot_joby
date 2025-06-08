import Groq from 'groq-sdk'
import fs from 'fs'
import path from 'path'

export interface TranscriptionResult {
    text: string
    success: boolean
    error?: string
}

export class GroqTranscriptionService {
    private groq: Groq

    constructor(apiKey: string) {
        this.groq = new Groq({
            apiKey: apiKey
        })
    }

    async transcribeAudio(audioFilePath: string): Promise<TranscriptionResult> {
        try {
            // Verificar que el archivo existe
            if (!fs.existsSync(audioFilePath)) {
                return {
                    text: '',
                    success: false,
                    error: 'Audio file not found'
                }
            }

            // Crear un ReadStream del archivo de audio
            const audioFile = fs.createReadStream(audioFilePath)

            // Llamar a la API de Groq para transcripción
            const transcription = await this.groq.audio.transcriptions.create({
                file: audioFile,
                model: 'whisper-large-v3',
                language: 'es', // Español
                response_format: 'text'
            })

            console.log('Groq transcription result:', transcription)

            return {
                text: transcription.toString().trim(),
                success: true
            }

        } catch (error) {
            console.error('Error transcribing audio with Groq:', error)
            return {
                text: '',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown transcription error'
            }
        }
    }

    async transcribeAudioBuffer(audioBuffer: Buffer, fileName: string = 'audio.ogg'): Promise<TranscriptionResult> {
        try {
            // Crear archivo temporal
            const tempDir = path.join(process.cwd(), 'temp')
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true })
            }

            const tempFilePath = path.join(tempDir, `temp_${Date.now()}_${fileName}`)
            
            // Escribir buffer a archivo temporal
            fs.writeFileSync(tempFilePath, audioBuffer)

            // Transcribir usando el archivo temporal
            const result = await this.transcribeAudio(tempFilePath)

            // Limpiar archivo temporal
            try {
                fs.unlinkSync(tempFilePath)
            } catch (cleanupError) {
                console.warn('Could not delete temp file:', cleanupError)
            }

            return result

        } catch (error) {
            console.error('Error transcribing audio buffer:', error)
            return {
                text: '',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown buffer transcription error'
            }
        }
    }

    // Detectar si un mensaje contiene audio
    static isAudioMessage(ctx: any): boolean {
        console.log('Checking if audio message, ctx:', {
            body: ctx.body,
            messageKeys: ctx.message ? Object.keys(ctx.message) : 'no message',
            message: ctx.message
        })
        
        // Verifica diferentes tipos de audio en WhatsApp/Baileys
        const isAudio = !!(
            ctx.body?.includes('[audio]') ||
            ctx.message?.audioMessage ||
            ctx.message?.pttMessage ||
            ctx.message?.voiceMessage ||
            (ctx.message && (
                ctx.message.type === 'audioMessage' ||
                ctx.message.type === 'pttMessage' ||
                ctx.message.messageType === 'audioMessage'
            )) ||
            // Detectar también por las keys del mensaje
            (ctx.message && Object.keys(ctx.message).some(key => 
                key.includes('audio') || key.includes('ptt') || key.includes('voice')
            ))
        )
        
        console.log('Is audio message:', isAudio)
        return isAudio
    }

    // Obtener el buffer de audio del mensaje
    static async getAudioBuffer(ctx: any, provider: any): Promise<Buffer | null> {
        try {
            console.log('Attempting to get audio buffer, ctx.message:', ctx.message)
            
            // Para Baileys, el audio viene en ctx.message
            if (ctx.message) {
                // Intentar usando el método downloadMediaMessage del bot
                if (provider && provider.downloadMediaMessage) {
                    return await provider.downloadMediaMessage(ctx.message)
                }
                
                // Si no está disponible, intentar acceso directo
                if (ctx.message.audioMessage?.url) {
                    // Usar fetch para descargar desde URL
                    const response = await fetch(ctx.message.audioMessage.url)
                    const arrayBuffer = await response.arrayBuffer()
                    return Buffer.from(arrayBuffer)
                }
                
                if (ctx.message.pttMessage?.url) {
                    const response = await fetch(ctx.message.pttMessage.url)
                    const arrayBuffer = await response.arrayBuffer()
                    return Buffer.from(arrayBuffer)
                }
            }

            // Último intento: usar utils de builderbot si están disponibles
            if (provider.utils && provider.utils.downloadMedia) {
                return await provider.utils.downloadMedia(ctx)
            }

            console.log('No audio buffer method found')
            return null
        } catch (error) {
            console.error('Error getting audio buffer:', error)
            return null
        }
    }

    // Método para obtener extensión de archivo según el tipo de audio
    static getAudioFileExtension(ctx: any): string {
        if (ctx.message?.audioMessage?.mimetype) {
            const mimeType = ctx.message.audioMessage.mimetype
            if (mimeType.includes('ogg')) return 'ogg'
            if (mimeType.includes('mp3')) return 'mp3'
            if (mimeType.includes('wav')) return 'wav'
            if (mimeType.includes('m4a')) return 'm4a'
        }
        
        // Default para WhatsApp
        return 'ogg'
    }
}
import 'dotenv/config'
import { join } from 'path'
import { createBot, createProvider, createFlow, addKeyword, utils } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { GeminiService } from './services/geminiService'
import { CommandHandler } from './services/commandHandler'
import { SimpleMemoryService } from './services/simpleMemory'
import { GroqTranscriptionService } from './services/groqTranscription'
import { MentalHealthService } from './services/mentalHealthService'
import { downloadContentFromMessage } from '@whiskeysockets/baileys'

const PORT = process.env.PORT ?? 3008
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GROQ_API_KEY = process.env.GROQ_API_KEY

if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY environment variable is required')
    process.exit(1)
}

if (!GROQ_API_KEY) {
    console.error('GROQ_API_KEY environment variable is required')
    process.exit(1)
}

const geminiService = new GeminiService(GEMINI_API_KEY)
const commandHandler = new CommandHandler()
const conversationMemory = new SimpleMemoryService(GEMINI_API_KEY)
const groqTranscription = new GroqTranscriptionService(GROQ_API_KEY)
const mentalHealthService = new MentalHealthService()

const discordFlow = addKeyword<Provider, Database>('doc').addAnswer(
    ['You can see the documentation here', '📄 https://builderbot.app/docs \n', 'Do you want to continue? *yes*'].join(
        '\n'
    ),
    { capture: true },
    async (ctx, { gotoFlow, flowDynamic }) => {
        if (ctx.body.toLocaleLowerCase().includes('yes')) {
            return gotoFlow(registerFlow)
        }
        await flowDynamic('Thanks!')
        return
    }
)

const naturalLanguageFlow = addKeyword<Provider, Database>([utils.setEvent('NATURAL_LANGUAGE')])
    .addAction(async (ctx, { flowDynamic, state }) => {
        const userId = ctx.from
        const userMessage = ctx.body
        
        const currentState = {
            inSurvey: state.get('inSurvey') || false,
            lastMessage: userMessage
        }

        const geminiResponse = await geminiService.processMessage(userMessage, currentState)
        
        const commandContext = {
            userId,
            state,
            updateState: async (data: any) => {
                for (const [key, value] of Object.entries(data)) {
                    await state.update({ [key]: value })
                }
            },
            sendMessage: async (message: string) => {
                await flowDynamic(message)
            }
        }

        await commandHandler.executeCommands(geminiResponse.internalCommands, commandContext)
        
        await flowDynamic(geminiResponse.userMessage)
    })

const catchAllFlow = addKeyword<Provider, Database>([''])
    .addAction(async (ctx, { flowDynamic, state, provider }) => {
        const userId = ctx.from
        let userMessage = ctx.body
        
        // Debug: log del contexto completo
        console.log('Full context:', JSON.stringify(ctx, null, 2))
        
        // Debug: log del provider para ver métodos disponibles
        if (GroqTranscriptionService.isAudioMessage(ctx)) {
            console.log('Provider methods:', Object.getOwnPropertyNames(provider))
            console.log('Provider vendor:', provider.vendor ? Object.getOwnPropertyNames(provider.vendor) : 'no vendor')
            console.log('Provider store:', provider.store ? Object.getOwnPropertyNames(provider.store) : 'no store')
        }
        
        // PASO 1: Detectar si es audio y transcribir
        if (GroqTranscriptionService.isAudioMessage(ctx)) {
            console.log('Audio message detected, attempting transcription...')
            
            try {
                let audioBuffer: Buffer | null = null

                // Método 1: Usar vendor de Baileys directamente con media key
                if (provider.vendor && provider.vendor.downloadContentFromMessage) {
                    console.log('Trying vendor.downloadContentFromMessage...')
                    try {
                        const stream = await provider.vendor.downloadContentFromMessage(
                            ctx.message.audioMessage, 
                            'audio'
                        )
                        const chunks: Buffer[] = []
                        for await (const chunk of stream) {
                            chunks.push(chunk)
                        }
                        audioBuffer = Buffer.concat(chunks)
                        console.log('Successfully downloaded audio using vendor')
                    } catch (vendorError) {
                        console.log('Vendor download failed:', vendorError)
                    }
                }

                // Método 2: Usar downloadContentFromMessage con claves apropiadas
                if (!audioBuffer) {
                    console.log('Trying downloadContentFromMessage with proper keys...')
                    try {
                        const stream = await downloadContentFromMessage(
                            ctx.message, 
                            'audio', 
                            { }, 
                            provider.vendor
                        )
                        const chunks: Buffer[] = []
                        for await (const chunk of stream) {
                            chunks.push(chunk)
                        }
                        audioBuffer = Buffer.concat(chunks)
                        console.log('Successfully downloaded audio using Baileys with vendor')
                    } catch (baileysError) {
                        console.log('Baileys download failed:', baileysError)
                    }
                }

                // Método 3: Usar métodos nativos del provider
                if (!audioBuffer && provider.saveFile) {
                    console.log('Trying provider.saveFile...')
                    try {
                        const filePath = await provider.saveFile(ctx)
                        if (filePath) {
                            const fs = await import('fs')
                            audioBuffer = fs.readFileSync(filePath)
                            console.log('Successfully got audio from saveFile')
                        }
                    } catch (saveFileError) {
                        console.log('SaveFile failed:', saveFileError)
                    }
                }

                if (audioBuffer && audioBuffer.length > 0) {
                    console.log('Audio buffer obtained, size:', audioBuffer.length)
                    const transcriptionResult = await groqTranscription.transcribeAudioBuffer(audioBuffer, 'audio.ogg')
                    
                    if (transcriptionResult.success && transcriptionResult.text) {
                        userMessage = transcriptionResult.text
                        console.log('Audio transcribed to:', userMessage)
                        await flowDynamic(`🎤 *Audio transcrito:* "${userMessage}"`)
                    } else {
                        console.log('Transcription failed:', transcriptionResult.error)
                        await flowDynamic('❌ No pude transcribir el audio. Por favor, inténtalo de nuevo o envía un mensaje de texto.')
                        return
                    }
                } else {
                    console.log('Could not obtain audio buffer')
                    await flowDynamic('❌ No pude descargar el archivo de audio. Por favor, inténtalo de nuevo.')
                    return
                }
                
            } catch (error) {
                console.error('Error processing audio:', error)
                await flowDynamic('❌ Hubo un error al procesar el audio. Por favor, envía un mensaje de texto.')
                return
            }
        }
        
        // PASO 2: Verificar si está en evaluación de salud mental
        if (mentalHealthService.isUserInMentalHealthAssessment(userId)) {
            // Calcular tiempo real de respuesta desde que se recibió el mensaje
            const messageTimestamp = ctx.messageTimestamp || Math.floor(Date.now() / 1000)
            const currentTime = Math.floor(Date.now() / 1000)
            const responseTime = currentTime - messageTimestamp
            
            const mentalHealthResponse = await mentalHealthService.processResponse(userId, userMessage, {
                isAudio: GroqTranscriptionService.isAudioMessage(ctx),
                responseTime: responseTime
            })
            
            await flowDynamic(mentalHealthResponse)
            return
        }

        // PASO 3: Detectar comando de evaluación de salud mental
        if (userMessage.toLowerCase().includes('evaluar salud mental') || 
            userMessage.toLowerCase().includes('evaluación mental') ||
            userMessage.toLowerCase().includes('bienestar laboral')) {
            
            const welcomeMessage = mentalHealthService.startAssessment(userId)
            await flowDynamic(welcomeMessage)
            return
        }

        // PASO 4: Continuar con el flujo normal usando el texto (original o transcrito)
        const currentState = {
            inSurvey: state.get('inSurvey') || false,
            lastMessage: userMessage,
            wasAudio: GroqTranscriptionService.isAudioMessage(ctx)
        }

        // Usar el sistema de memoria conversacional
        const conversationResponse = await conversationMemory.processConversation(userId, userMessage, currentState)
        
        const commandContext = {
            userId,
            state,
            updateState: async (data: any) => {
                for (const [key, value] of Object.entries(data)) {
                    await state.update({ [key]: value })
                }
            },
            sendMessage: async (message: string) => {
                await flowDynamic(message)
            }
        }

        // Ejecutar comandos internos si los hay
        if (conversationResponse.internalCommands.length > 0) {
            await commandHandler.executeCommands(conversationResponse.internalCommands, commandContext)
        }
        
        await flowDynamic(conversationResponse.userMessage)
    })

const welcomeFlow = addKeyword<Provider, Database>(['hi', 'hello', 'hola'])
    .addAnswer(`🙌 Hola, bienvenido a este *Chatbot* inteligente`)
    .addAnswer(`Puedo ayudarte con encuestas y responder a tus consultas en lenguaje natural.`)
    .addAnswer(`💼 *Funciones especiales:*\n• Escribe 'evaluar salud mental' para evaluación de bienestar laboral\n• Envía mensajes de voz - los transcribo automáticamente\n• Mantengo memoria de toda nuestra conversación`)
    .addAnswer(`Prueba escribiendo "evaluar salud mental" o cualquier otra consulta.`)

const registerFlow = addKeyword<Provider, Database>(utils.setEvent('REGISTER_FLOW'))
    .addAnswer(`What is your name?`, { capture: true }, async (ctx, { state }) => {
        await state.update({ name: ctx.body })
    })
    .addAnswer('What is your age?', { capture: true }, async (ctx, { state }) => {
        await state.update({ age: ctx.body })
    })
    .addAction(async (_, { flowDynamic, state }) => {
        await flowDynamic(`${state.get('name')}, thanks for your information!: Your age: ${state.get('age')}`)
    })

const fullSamplesFlow = addKeyword<Provider, Database>(['samples', utils.setEvent('SAMPLES')])
    .addAnswer(`💪 I'll send you a lot files...`)
    .addAnswer(`Send image from Local`, { media: join(process.cwd(), 'assets', 'sample.png') })
    .addAnswer(`Send video from URL`, {
        media: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExYTJ0ZGdjd2syeXAwMjQ4aWdkcW04OWlqcXI3Ynh1ODkwZ25zZWZ1dCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/LCohAb657pSdHv0Q5h/giphy.mp4',
    })
    .addAnswer(`Send audio from URL`, { media: 'https://cdn.freesound.org/previews/728/728142_11861866-lq.mp3' })
    .addAnswer(`Send file from URL`, {
        media: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    })

const main = async () => {
    const adapterFlow = createFlow([catchAllFlow, welcomeFlow, naturalLanguageFlow, registerFlow, fullSamplesFlow])
    
    const adapterProvider = createProvider(Provider)
    const adapterDB = new Database()

    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    // Guardar referencia del bot para usar en los flows (si es necesario en el futuro)
    // const botInstance: any = null

    adapterProvider.server.post(
        '/v1/messages',
        handleCtx(async (bot, req, res) => {
            const { number, message, urlMedia } = req.body
            await bot.sendMessage(number, message, { media: urlMedia ?? null })
            return res.end('sended')
        })
    )

    adapterProvider.server.post(
        '/v1/register',
        handleCtx(async (bot, req, res) => {
            const { number, name } = req.body
            await bot.dispatch('REGISTER_FLOW', { from: number, name })
            return res.end('trigger')
        })
    )

    adapterProvider.server.post(
        '/v1/samples',
        handleCtx(async (bot, req, res) => {
            const { number, name } = req.body
            await bot.dispatch('SAMPLES', { from: number, name })
            return res.end('trigger')
        })
    )

    adapterProvider.server.post(
        '/v1/blacklist',
        handleCtx(async (bot, req, res) => {
            const { number, intent } = req.body
            if (intent === 'remove') bot.blacklist.remove(number)
            if (intent === 'add') bot.blacklist.add(number)

            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'ok', number, intent }))
        })
    )

    adapterProvider.server.post(
        '/v1/memory/clear',
        handleCtx(async (bot, req, res) => {
            const { number } = req.body
            await conversationMemory.clearUserMemory(number)
            
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'memory_cleared', number }))
        })
    )

    adapterProvider.server.get(
        '/v1/memory/stats',
        handleCtx(async (bot, req, res) => {
            const activeUsers = conversationMemory.getActiveUsersCount()
            
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ activeUsers, timestamp: new Date().toISOString() }))
        })
    )

    adapterProvider.server.post(
        '/v1/transcribe/test',
        handleCtx(async (bot, req, res) => {
            try {
                // Endpoint para testear transcripción con archivos subidos
                res.writeHead(200, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ 
                    message: 'Transcription service ready',
                    groqConnected: !!GROQ_API_KEY,
                    timestamp: new Date().toISOString()
                }))
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' })
                return res.end(JSON.stringify({ error: 'Transcription service error' }))
            }
        })
    )

    httpServer(+PORT)
}

main()

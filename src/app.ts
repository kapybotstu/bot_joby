import 'dotenv/config'
import { join } from 'path'
import { createBot, createProvider, createFlow, addKeyword, utils } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'
import { GeminiService } from './services/geminiService'
import { CommandHandler } from './services/commandHandler'
import { FallbackMemoryService } from './services/fallbackMemory'
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
const conversationMemory = new FallbackMemoryService()
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
            console.log('Provider store:', (provider as any).store ? Object.getOwnPropertyNames((provider as any).store) : 'no store')
        }
        
        // PASO 1: Detectar si es audio y transcribir
        if (GroqTranscriptionService.isAudioMessage(ctx)) {
            console.log('Audio message detected, attempting transcription...')
            
            try {
                let audioBuffer: Buffer | null = null

                // Método 1: Usar vendor de Baileys directamente con media key
                if (provider.vendor && (provider.vendor as any).downloadContentFromMessage) {
                    console.log('Trying vendor.downloadContentFromMessage...')
                    try {
                        const stream = await (provider.vendor as any).downloadContentFromMessage(
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
                            'audio'
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
                if (!audioBuffer && (provider as any).saveFile) {
                    console.log('Trying provider.saveFile...')
                    try {
                        const filePath = await (provider as any).saveFile(ctx)
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

        // PASO 3: Detectar comando de evaluación de salud mental (PRIORIDAD ALTA)
        const mentalHealthKeywords = [
            'evaluar salud mental', 'evaluación mental', 'bienestar laboral',
            'encuesta', 'hacer encuesta', 'quiero hacer la encuesta',
            'empezar encuesta', 'iniciar encuesta', 'hacer la encuesta',
            'evaluación', 'test', 'cuestionario', 'salud mental',
            'bienestar', 'estado mental', 'como estoy mentalmente',
            'evaluar mi estado', 'checar mi salud', 'empezamos',
            'vamos', 'adelante', 'continuar', 'continúa'
        ]
        
        const lowerMessage = userMessage.toLowerCase()
        const isMentalHealthRequest = mentalHealthKeywords.some(keyword => 
            lowerMessage.includes(keyword)
        )
        
        // También verificar si en el contexto previo se mencionó hacer encuesta
        const currentState = {
            inSurvey: state.get('inSurvey') || false,
            lastMessage: userMessage,
            wasAudio: GroqTranscriptionService.isAudioMessage(ctx)
        }
        
        if (isMentalHealthRequest) {
            const welcomeMessage = mentalHealthService.startAssessment(userId)
            await flowDynamic(welcomeMessage)
            return
        }

        // PASO 4: Continuar con el flujo normal usando el texto (original o transcrito)

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
    .addAnswer(`💼 *Funciones especiales:*\n• Escribe 'hacer encuesta' o 'evaluar salud mental' para evaluación de bienestar laboral\n• Envía mensajes de voz - los transcribo automáticamente\n• Mantengo memoria de toda nuestra conversación`)
    .addAnswer(`Prueba escribiendo "hacer encuesta" o cualquier otra consulta.`)

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
    // Crear directorio de sesiones si no existe
    const fs = await import('fs')
    const SESSION_DIR = './bot_sessions'
    
    // Verificar si estamos en desarrollo o producción
    const isDevEnvironment = process.env.NODE_ENV === 'development'
    
    // Solo en desarrollo, preguntar si limpiar sesiones
    if (isDevEnvironment && process.env.CLEAN_SESSIONS === 'true') {
        console.log('🧹 Limpiando sesiones anteriores...')
        try {
            await fs.promises.rm(SESSION_DIR, { recursive: true, force: true })
            await fs.promises.rm('./bot.qr.png', { force: true })
        } catch (error) {
            // Ignorar errores si no existe
        }
    }
    
    // Asegurar que el directorio existe
    await fs.promises.mkdir(SESSION_DIR, { recursive: true }).catch(() => {})
    
    const adapterFlow = createFlow([catchAllFlow, welcomeFlow, naturalLanguageFlow, registerFlow, fullSamplesFlow])
    
    // Configurar el provider con opciones específicas
    const adapterProvider = createProvider(Provider, {
        name: 'bot_sessions',
        usePairingCode: true,
        phoneNumber: process.env.PHONE_NUMBER,
        timeoutMs: 120000, // Timeout de 2 minutos para el código
    })
    
    const adapterDB = new Database()

    const { handleCtx, httpServer } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })
    
    // Manejar eventos del provider para mostrar el código de vinculación
    adapterProvider.on('require_action', async (ctx) => {
        const { instructions, code } = ctx
        if (instructions) {
            console.log('\n🔴 ACCIÓN REQUERIDA 🔴')
            console.log('📱 Vincula tu dispositivo con el siguiente código:')
            console.log(`\n🔐 CÓDIGO: ${code || 'Esperando código...'}\n`)
            console.log('👉 Pasos para vincular:')
            console.log('1. Abre WhatsApp en tu teléfono')
            console.log('2. Ve a Configuración → Dispositivos vinculados')
            console.log('3. Toca "Vincular dispositivo"')
            console.log('4. Selecciona "Vincular con número de teléfono"')
            console.log('5. Ingresa el código de 8 dígitos')
            console.log('\n⏰ El código expira en 60 segundos...\n')
        }
    })
    
    // Log cuando se conecte exitosamente
    adapterProvider.on('ready', async () => {
        console.log('✅ Bot conectado exitosamente!')
        console.log('📱 Número vinculado correctamente')
        console.log('🤖 Bot listo para recibir mensajes\n')
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

    adapterProvider.server.post(
        '/v1/assessment/reset',
        handleCtx(async (bot, req, res) => {
            const { number } = req.body
            // Reset mental health assessment for user
            mentalHealthService.clearUserAssessment(number)
            await conversationMemory.clearUserMemory(number)
            
            res.writeHead(200, { 'Content-Type': 'application/json' })
            return res.end(JSON.stringify({ status: 'assessment_reset', number }))
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
    
    // Mostrar información de inicio
    console.log('\n🚀 Servidor iniciado en puerto:', PORT)
    console.log('📱 Bot de WhatsApp iniciando...')
    console.log('📞 Número para vincular:', process.env.PHONE_NUMBER || 'No configurado')
    
    // Verificar si ya existe una sesión
    const sessionExists = await fs.promises.access('./bot_sessions/creds.json').then(() => true).catch(() => false)
    
    if (sessionExists) {
        console.log('📂 Sesión existente encontrada, intentando reconectar...')
    } else {
        console.log('🆕 No hay sesión guardada, se generará un código de vinculación')
        console.log('🔐 Prepárate para ingresar el código en WhatsApp')
    }
    console.log('\n')
}

main().catch(error => {
    console.error('❌ Error al iniciar el bot:', error)
    process.exit(1)
})

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ConversationChain } from 'langchain/chains'
import { BufferMemory, ChatMessageHistory } from 'langchain/memory'
import { PromptTemplate } from '@langchain/core/prompts'
import { HumanMessage, AIMessage } from '@langchain/core/messages'

export interface ConversationResponse {
    userMessage: string
    internalCommands: string[]
    memoryUpdated: boolean
}

export class ConversationMemoryService {
    private model: ChatGoogleGenerativeAI
    private userMemories: Map<string, BufferMemory> = new Map()
    private userChains: Map<string, ConversationChain> = new Map()

    constructor(apiKey: string) {
        this.model = new ChatGoogleGenerativeAI({
            model: 'gemini-2.5-flash-preview-04-17',
            apiKey: apiKey,
            temperature: 0.7
        })
    }

    private getUserMemory(userId: string): BufferMemory {
        if (!this.userMemories.has(userId)) {
            const memory = new BufferMemory({
                chatHistory: new ChatMessageHistory(),
                returnMessages: true,
                memoryKey: 'chat_history'
            })
            this.userMemories.set(userId, memory)
        }
        return this.userMemories.get(userId)!
    }

    private getUserChain(userId: string): ConversationChain {
        if (!this.userChains.has(userId)) {
            const memory = this.getUserMemory(userId)
            
            const prompt = PromptTemplate.fromTemplate(`
Eres un asistente conversacional inteligente y amigable. Tu nombre es Kapy Bot.

IMPORTANTE: Mantén memoria de toda la conversación. Recuerda lo que el usuario ha dicho anteriormente.

Características:
- Conversacional y natural
- Recuerdas el contexto de toda la conversación
- Puedes ayudar con encuestas
- Respondes preguntas específicas (como recetas, consejos, etc.)
- Mantienes el flujo de conversación

Comandos especiales que puedes usar:
- Si el usuario quiere "empezar/iniciar encuesta" → incluye [START_SURVEY] al final
- Si el usuario quiere "terminar/finalizar" una encuesta → incluye [END_SURVEY] al final
- Si estás en una encuesta → incluye [SAVE_RESPONSE] al final

Historial de conversación:
{chat_history}

Usuario actual: {input}

Responde de manera natural y conversacional. Si necesitas usar un comando, inclúyelo entre corchetes al final:
`)

            const chain = new ConversationChain({
                llm: this.model,
                memory: memory,
                prompt: prompt,
                verbose: false
            })
            
            this.userChains.set(userId, chain)
        }
        return this.userChains.get(userId)!
    }

    async processConversation(userId: string, userInput: string, context?: any): Promise<ConversationResponse> {
        try {
            const chain = this.getUserChain(userId)
            
            // Agregar contexto especial si está disponible
            let enhancedInput = userInput
            if (context?.inSurvey) {
                enhancedInput = `[EN ENCUESTA] ${userInput}`
            }

            const response = await chain.call({
                input: enhancedInput
            })

            const responseText = response.response || response.text || ''
            
            // Extraer comandos internos
            const commandRegex = /\[([A-Z_]+)\]/g
            const commands: string[] = []
            let match: RegExpExecArray | null
            while ((match = commandRegex.exec(responseText)) !== null) {
                commands.push(match[1])
            }

            // Limpiar la respuesta de comandos
            const cleanResponse = responseText.replace(/\[([A-Z_]+)\]/g, '').trim()

            return {
                userMessage: cleanResponse || "Entiendo, ¿en qué más puedo ayudarte?",
                internalCommands: commands,
                memoryUpdated: true
            }

        } catch (error) {
            console.error('Error in conversation memory:', error)
            
            // Fallback manual con memoria básica
            const memory = this.getUserMemory(userId)
            
            // Guardar manualmente en memoria
            await memory.saveContext(
                { input: userInput },
                { output: "Error procesando, pero recuerdo nuestra conversación" }
            )

            return {
                userMessage: "Disculpa, tuve un pequeño problema pero sigo recordando nuestra conversación. ¿Puedes repetir lo que necesitas?",
                internalCommands: [],
                memoryUpdated: true
            }
        }
    }

    async clearUserMemory(userId: string): Promise<void> {
        this.userMemories.delete(userId)
        this.userChains.delete(userId)
    }

    async getUserConversationHistory(userId: string): Promise<string[]> {
        const memory = this.getUserMemory(userId)
        const messages = await memory.chatHistory.getMessages()
        
        return messages.map(msg => {
            if (msg instanceof HumanMessage) {
                return `Usuario: ${msg.content}`
            } else if (msg instanceof AIMessage) {
                return `Kapy: ${msg.content}`
            }
            return msg.content.toString()
        })
    }

    getActiveUsersCount(): number {
        return this.userMemories.size
    }
}
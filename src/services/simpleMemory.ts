import { ChatGoogleGenerativeAI } from '@langchain/google-genai'

export interface ConversationResponse {
    userMessage: string
    internalCommands: string[]
    memoryUpdated: boolean
}

interface UserConversation {
    messages: Array<{ role: 'user' | 'assistant', content: string, timestamp: Date }>
    context: any
}

export class SimpleMemoryService {
    private model: ChatGoogleGenerativeAI
    private userConversations: Map<string, UserConversation> = new Map()
    private maxMessages = 20 // Límite de mensajes en memoria

    constructor(apiKey: string) {
        this.model = new ChatGoogleGenerativeAI({
            model: 'gemini-2.5-flash-preview-04-17',
            apiKey: apiKey,
            temperature: 0.7
        })
    }

    private getUserConversation(userId: string): UserConversation {
        if (!this.userConversations.has(userId)) {
            this.userConversations.set(userId, {
                messages: [],
                context: {}
            })
        }
        return this.userConversations.get(userId)!
    }

    private buildConversationHistory(messages: UserConversation['messages']): string {
        if (messages.length === 0) return "Primera conversación con este usuario."
        
        return messages
            .slice(-this.maxMessages) // Solo los últimos N mensajes
            .map(msg => `${msg.role === 'user' ? 'Usuario' : 'Kapy'}: ${msg.content}`)
            .join('\n')
    }

    async processConversation(userId: string, userInput: string, context?: any): Promise<ConversationResponse> {
        try {
            const conversation = this.getUserConversation(userId)
            const history = this.buildConversationHistory(conversation.messages)

            const prompt = `
Eres Kapy Bot, un asistente conversacional inteligente y amigable.

MEMORIA DE CONVERSACIÓN:
${history}

IMPORTANTE: 
- Recuerda toda la conversación anterior
- Mantén coherencia con lo que se ha hablado
- Si el usuario preguntó algo antes, refiérete a ello
- Sé natural y conversacional

COMANDOS ESPECIALES (solo incluir si aplica):
- Si quiere "empezar/iniciar encuesta" → incluye [START_SURVEY]
- Si quiere "terminar/finalizar" encuesta → incluye [END_SURVEY]  
- Si está en encuesta → incluye [SAVE_RESPONSE]

USUARIO ACTUAL: ${userInput}
${context?.inSurvey ? '[CONTEXTO: Usuario está en una encuesta]' : ''}

Responde de manera natural y conversacional. Si necesitas un comando, inclúyelo entre corchetes al final.
`

            const result = await this.model.invoke(prompt)
            const responseText = result.content.toString()

            // Extraer comandos
            const commandRegex = /\[([A-Z_]+)\]/g
            const commands: string[] = []
            let match: RegExpExecArray | null
            while ((match = commandRegex.exec(responseText)) !== null) {
                commands.push(match[1])
            }

            // Limpiar respuesta
            const cleanResponse = responseText.replace(/\[([A-Z_]+)\]/g, '').trim()

            // Guardar en memoria
            conversation.messages.push(
                { role: 'user', content: userInput, timestamp: new Date() },
                { role: 'assistant', content: cleanResponse, timestamp: new Date() }
            )

            // Mantener solo los últimos mensajes
            if (conversation.messages.length > this.maxMessages * 2) {
                conversation.messages = conversation.messages.slice(-this.maxMessages * 2)
            }

            conversation.context = { ...conversation.context, ...context }

            return {
                userMessage: cleanResponse || "¿En qué más puedo ayudarte?",
                internalCommands: commands,
                memoryUpdated: true
            }

        } catch (error) {
            console.error('Error in simple memory service:', error)
            
            // Fallback básico pero con memoria
            const conversation = this.getUserConversation(userId)
            const hasHistory = conversation.messages.length > 0
            
            let fallbackMessage = "Disculpa, tuve un problema técnico."
            if (hasHistory) {
                fallbackMessage += " Pero recuerdo nuestra conversación anterior. ¿Puedes repetir lo que necesitas?"
            }

            // Guardar el intento en memoria
            conversation.messages.push(
                { role: 'user', content: userInput, timestamp: new Date() },
                { role: 'assistant', content: fallbackMessage, timestamp: new Date() }
            )

            return {
                userMessage: fallbackMessage,
                internalCommands: [],
                memoryUpdated: true
            }
        }
    }

    async clearUserMemory(userId: string): Promise<void> {
        this.userConversations.delete(userId)
    }

    async getUserConversationHistory(userId: string): Promise<string[]> {
        const conversation = this.getUserConversation(userId)
        return conversation.messages.map(msg => 
            `${msg.role === 'user' ? 'Usuario' : 'Kapy'}: ${msg.content} (${msg.timestamp.toLocaleString()})`
        )
    }

    getActiveUsersCount(): number {
        return this.userConversations.size
    }

    // Método para obtener estadísticas de memoria
    getMemoryStats(): { [userId: string]: { messageCount: number, lastActivity: Date } } {
        const stats: { [userId: string]: { messageCount: number, lastActivity: Date } } = {}
        
        this.userConversations.forEach((conversation, userId) => {
            const lastMessage = conversation.messages[conversation.messages.length - 1]
            stats[userId] = {
                messageCount: conversation.messages.length,
                lastActivity: lastMessage?.timestamp || new Date()
            }
        })
        
        return stats
    }
}
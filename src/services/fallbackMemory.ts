export interface ConversationResponse {
    userMessage: string
    internalCommands: string[]
    memoryUpdated: boolean
}

interface UserConversation {
    messages: Array<{ role: 'user' | 'assistant', content: string, timestamp: Date }>
    context: any
}

export class FallbackMemoryService {
    private userConversations: Map<string, UserConversation> = new Map()
    private maxMessages = 10

    private getUserConversation(userId: string): UserConversation {
        if (!this.userConversations.has(userId)) {
            this.userConversations.set(userId, {
                messages: [],
                context: {}
            })
        }
        return this.userConversations.get(userId)!
    }

    async processConversation(userId: string, userInput: string, context?: any): Promise<ConversationResponse> {
        try {
            const conversation = this.getUserConversation(userId)
            
            // Simple responses for common patterns
            let response = "Entiendo tu mensaje. "
            
            const lowerInput = userInput.toLowerCase()
            
            if (lowerInput.includes('encuesta') || lowerInput.includes('evaluación')) {
                response = "¡Perfecto! Para iniciar la evaluación de salud mental laboral, escribe exactamente 'hacer encuesta' y el sistema te guiará."
            } else if (lowerInput.includes('hola') || lowerInput.includes('hello')) {
                response = "¡Hola! Soy Kapy Bot, tu asistente de RRHH. ¿En qué puedo ayudarte hoy? Puedes escribir 'hacer encuesta' para una evaluación de bienestar laboral."
            } else if (lowerInput.includes('gracias')) {
                response = "¡De nada! Estoy aquí para ayudarte. ¿Hay algo más en lo que pueda asistirte?"
            } else {
                response = "Entiendo tu consulta. Como asistente de RRHH estoy aquí para ayudarte. ¿Te interesa hacer una evaluación de bienestar? Escribe 'hacer encuesta'."
            }

            // Guardar en memoria
            conversation.messages.push(
                { role: 'user', content: userInput, timestamp: new Date() },
                { role: 'assistant', content: response, timestamp: new Date() }
            )

            // Mantener solo los últimos mensajes
            if (conversation.messages.length > this.maxMessages * 2) {
                conversation.messages = conversation.messages.slice(-this.maxMessages * 2)
            }

            conversation.context = { ...conversation.context, ...context }

            return {
                userMessage: response,
                internalCommands: [],
                memoryUpdated: true
            }

        } catch (error) {
            console.error('Error in fallback memory service:', error)
            
            return {
                userMessage: "Disculpa, tuve un problema técnico. ¿Puedes repetir lo que necesitas?",
                internalCommands: [],
                memoryUpdated: false
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
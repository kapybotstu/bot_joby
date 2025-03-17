import axios from 'axios';
import { FirebaseService, FirebaseConfig, CommandResult, MessageContent } from './firebase';

interface ChatGPTConfig {
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
}

/**
 * Enhanced ChatGPT Handler that integrates with Firebase
 * 
 * This class handles the interaction between user messages, ChatGPT, and Firebase,
 * managing the flow of data and commands between systems.
 */
class ChatGPTHandler {
    private config: ChatGPTConfig;
    private firebaseService: FirebaseService;
    private systemPrompt: string;

    constructor(config: ChatGPTConfig, firebaseConfig: FirebaseConfig, useLocalStorage: boolean = false) {
        this.config = config;
        this.firebaseService = new FirebaseService(firebaseConfig, useLocalStorage);
        
        // Define the system prompt for GPT that enables "behind the scenes" Firebase commands
        this.systemPrompt = `
            Eres un asistente virtual para un sistema de beneficios de empresa llamado VMICA.
            
            INSTRUCCIONES CRÍTICAS:
            - Responde de manera conversacional y amigable.
            - NO uses saludos formales como "Hola" o "Saludos" al inicio de cada mensaje (a menos que sea la primera interacción).
            - Mantén tus respuestas concisas y directas.
            - NUNCA menciones Firebase, comandos técnicos, o la estructura interna del sistema en tus respuestas al usuario.
            - Evita términos técnicos como "consulta", "base de datos", "query", etc.
            
            Cuando necesites acceder a información o realizar acciones que requieran datos, genera comandos para Firebase
            sin mencionarlos al usuario. Estos comandos serán procesados automáticamente.
            
            Tu respuesta debe tener SIEMPRE este formato:
            {
                "userMessage": "Tu respuesta natural para el usuario sin términos técnicos",
                "commands": ["firebase:operacion:coleccion/documento:parametros", "otro:comando"]
            }
            
            OPERACIONES DISPONIBLES:
            - "firebase:get:nombreColeccion/idDocumento" - Obtener documento específico
            - "firebase:get:nombreColeccion" - Obtener todos los documentos de una colección
            - "firebase:query:nombreColeccion:campo=valor,otrocampo<valor" - Buscar con condiciones
            - "firebase:update:nombreColeccion/idDocumento:campo=valor,campo2=valor2" - Actualizar campos
            - "firebase:set:nombreColeccion/idDocumento:campo=valor,campo2=valor2" - Crear/reemplazar documento
            - "firebase:count:nombreColeccion:campo=valor" - Contar documentos que cumplen condiciones
            
            COLECCIONES PRINCIPALES:
            - "userBenefits" - Información de beneficios de empleados (Nombre, Beneficio_seleccionado, Categoria, etc.)
            - "userSessions" - Sesiones de usuario y conversaciones
            
            Ejemplos de comandos:
            - Buscar beneficios de un usuario: "firebase:query:userBenefits:Id_usuario=5"
            - Buscar por nombre: "firebase:query:userBenefits:Nombre=Nicole Natalie Lagos Alvarado"
            - Buscar beneficios por categoría: "firebase:query:userBenefits:Categoria=Comidas del Mundo"
            - Buscar beneficios por mes: "firebase:query:userBenefits:Mes_de_beneficio=agosto"
            - Guardar preferencia: "firebase:update:userPreferences/123:theme=dark,language=es"
            
            IMPORTANTE: El usuario NO VE estos comandos, solo recibe tu mensaje en "userMessage".
        `;
    }

    /**
     * Process a user message through ChatGPT and handle any Firebase commands
     */
    async processMessage(message: string, userId: string): Promise<MessageContent> {
        try {
            // Load user session for context
            const userSession = await this.firebaseService.loadUserSession(userId);
            const recentConversations = userSession.conversations.slice(-5);
            
            // Check API key
            if (!this.config.apiKey || this.config.apiKey === 'your-openai-api-key') {
                throw new Error('API key not configured');
            }
            
            console.log(`Processing message for user ${userId}: "${message.substring(0, 50)}..."`);
            
            // Call OpenAI API
            const response = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: this.config.model,
                    messages: [
                        {
                            role: "system",
                            content: this.systemPrompt
                        },
                        // Include recent conversation history for context
                        ...recentConversations.flatMap(interaction => [
                            {
                                role: "user",
                                content: interaction.userMessage
                            },
                            {
                                role: "assistant",
                                content: interaction.botResponse
                            }
                        ]),
                        {
                            role: "user",
                            content: message
                        }
                    ],
                    max_tokens: this.config.maxTokens,
                    temperature: this.config.temperature,
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.config.apiKey}`
                    }
                }
            );
    
            // Parse the response
            const content = response.data.choices[0].message.content;
            const parsedContent = this.parseGPTResponse(content);
            
            // Update user session
            await this.firebaseService.updateUserSession(
                userId, 
                message, 
                parsedContent.userMessage
            );
            
            return parsedContent;
        } catch (error: any) {
            console.error('Error processing message with ChatGPT:', error);
            
            // Return appropriate error message
            if (error.response && error.response.status === 401) {
                return {
                    userMessage: "Lo siento, pero no puedo procesar tu mensaje en este momento. Por favor, intenta más tarde.",
                    commands: []
                };
            } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                return {
                    userMessage: "Parece que hay problemas de conexión. ¿Podrías intentarlo nuevamente en unos momentos?",
                    commands: []
                };
            }
            
            return {
                userMessage: "Disculpa, tuve un problema al entender tu mensaje. ¿Podrías expresarlo de otra manera?",
                commands: []
            };
        }
    }

    /**
     * Execute Firebase commands and get formatted results for user
     */
    async executeCommandsAndFormat(commands: string[], queryContext: string): Promise<{
        commandResults: CommandResult[],
        formattedMessage: string
    }> {
        try {
            // Execute commands
            const commandResults = await this.firebaseService.executeCommands(commands);
            
            // Format results for user
            const formattedMessage = this.firebaseService.formatResultsForUser(commandResults, queryContext);
            
            return {
                commandResults,
                formattedMessage
            };
        } catch (error) {
            console.error('Error executing Firebase commands:', error);
            return {
                commandResults: [],
                formattedMessage: "Lo siento, tuve un problema al buscar esa información. ¿Podrías intentarlo de nuevo?"
            };
        }
    }

    /**
     * Process a message, execute any commands, and return a final response
     * This provides a simpler interface for the main bot
     */
    async processMessageWithCommands(message: string, userId: string): Promise<string> {
        try {
            // First, get initial response with commands
            const { userMessage, commands } = await this.processMessage(message, userId);
            
            // If there are no commands, just return the user message
            if (!commands || commands.length === 0) {
                return userMessage;
            }
            
            // Execute commands and get formatted results
            const { formattedMessage } = await this.executeCommandsAndFormat(commands, message);
            
            // Combine the GPT response with formatted Firebase results
            // Only append the Firebase results if they add useful information
            if (formattedMessage && formattedMessage !== "No se encontraron resultados para tu consulta.") {
                return `${userMessage}\n\n${formattedMessage}`;
            }
            
            return userMessage;
        } catch (error) {
            console.error('Error in processMessageWithCommands:', error);
            return "Lo siento, ocurrió un error al procesar tu mensaje. Por favor, intenta nuevamente.";
        }
    }

    /**
     * Generate analytical insights from a query
     */
    async generateAnalyticsResponse(query: string, userId: string): Promise<string> {
        try {
            // Process the analytics query with ChatGPT
            const { userMessage, commands } = await this.processMessage(
                `Necesito un análisis detallado sobre: ${query}`, 
                userId
            );
            
            // Execute commands to get data
            const commandResults = await this.firebaseService.executeCommands(commands);
            
            // Extract all result data
            const allData: any[] = [];
            commandResults.forEach(result => {
                if (Array.isArray(result.result)) {
                    allData.push(...result.result);
                } else if (result.result && typeof result.result === 'object') {
                    allData.push(result.result);
                }
            });
            
            // Generate insights if we have data
            if (allData.length > 0) {
                const insights = this.firebaseService.generateInsights(allData, query);
                return `${userMessage}\n\n${insights}`;
            }
            
            return userMessage;
        } catch (error) {
            console.error('Error generating analytics:', error);
            return "Lo siento, no pude completar el análisis solicitado. Por favor, intenta con una consulta más específica.";
        }
    }

    /**
     * Check if Firebase is connected
     */
    isConnected(): boolean {
        return this.firebaseService.isFirebaseConnected();
    }

    /**
     * Check if the OpenAI API key is valid
     */
    async checkOpenAIApiKey(): Promise<boolean> {
        try {
            if (!this.config.apiKey || this.config.apiKey === 'your-openai-api-key') {
                return false;
            }

            // Make a small request to verify the API key
            await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: this.config.model,
                    messages: [
                        {
                            role: "system",
                            content: "Hello"
                        },
                        {
                            role: "user",
                            content: "test"
                        }
                    ],
                    max_tokens: 5
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.config.apiKey}`
                    }
                }
            );
            return true;
        } catch (error) {
            console.error("Error verifying OpenAI API key:", error);
            return false;
        }
    }

    /**
     * Parse GPT response to extract user message and commands
     */
    private parseGPTResponse(content: string): MessageContent {
        try {
            // Handle cases where response might not be valid JSON
            if (!content.includes('{') || !content.includes('}')) {
                return {
                    userMessage: content,
                    commands: []
                };
            }

            // Extract JSON object from response (in case there's extra text)
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return {
                    userMessage: content,
                    commands: []
                };
            }

            const jsonString = jsonMatch[0];
            const parsed = JSON.parse(jsonString);
            
            return {
                userMessage: parsed.userMessage || "No pude generar una respuesta clara.",
                commands: Array.isArray(parsed.commands) ? parsed.commands : []
            };
        } catch (error) {
            console.error('Error parsing GPT response:', error);
            return {
                userMessage: content,
                commands: []
            };
        }
    }
}

export default ChatGPTHandler;
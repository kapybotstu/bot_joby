export interface CommandContext {
    userId: string
    state: any
    updateState: (data: any) => Promise<void>
    sendMessage: (message: string) => Promise<void>
}

export class CommandHandler {
    private surveyData: Map<string, any> = new Map()

    async executeCommands(commands: string[], context: CommandContext): Promise<void> {
        for (const command of commands) {
            await this.executeCommand(command, context)
        }
    }

    private async executeCommand(command: string, context: CommandContext): Promise<void> {
        const [action, ...params] = command.split(':')
        
        switch (action) {
            case 'START_SURVEY':
                await this.startSurvey(context, params[0])
                break
            case 'SAVE_RESPONSE':
                await this.saveResponse(context, params[0], params[1])
                break
            case 'END_SURVEY':
                await this.endSurvey(context)
                break
            case 'GET_INFO':
                await this.getInfo(context, params[0])
                break
            case 'UPDATE_STATE':
                await this.updateState(context, params[0], params[1])
                break
            case 'NEXT_QUESTION':
                await this.nextQuestion(context)
                break
            default:
                console.log(`Unknown command: ${command}`)
        }
    }

    private async startSurvey(context: CommandContext, surveyType?: string): Promise<void> {
        const userId = context.userId
        
        this.surveyData.set(userId, {
            active: true,
            type: surveyType || 'general',
            responses: {},
            currentQuestion: 0,
            startTime: new Date()
        })

        await context.updateState({ 
            inSurvey: true, 
            surveyType: surveyType || 'general' 
        })

        console.log(`Started survey for user ${userId}`)
    }

    private async saveResponse(context: CommandContext, questionId?: string, response?: string): Promise<void> {
        const userId = context.userId
        const surveyData = this.surveyData.get(userId)
        
        if (surveyData && surveyData.active) {
            const currentQuestion = questionId || `question_${surveyData.currentQuestion}`
            const userResponse = response || context.state.get('lastMessage')
            
            surveyData.responses[currentQuestion] = userResponse
            surveyData.lastResponse = new Date()
            
            this.surveyData.set(userId, surveyData)
            
            console.log(`Saved response for user ${userId}: ${currentQuestion} = ${userResponse}`)
        }
    }

    private async endSurvey(context: CommandContext): Promise<void> {
        const userId = context.userId
        const surveyData = this.surveyData.get(userId)
        
        if (surveyData) {
            surveyData.active = false
            surveyData.endTime = new Date()
            
            await context.updateState({ 
                inSurvey: false,
                lastSurveyData: surveyData
            })
            
            console.log(`Ended survey for user ${userId}`, surveyData.responses)
        }
    }

    private async getInfo(context: CommandContext, infoType?: string): Promise<void> {
        const userId = context.userId
        const surveyData = this.surveyData.get(userId)
        
        const info = {
            userId,
            hasSurvey: !!surveyData,
            surveyActive: surveyData?.active || false,
            surveyResponses: surveyData?.responses || {},
            state: context.state
        }
        
        console.log(`Info for user ${userId}:`, info)
    }

    private async updateState(context: CommandContext, key?: string, value?: string): Promise<void> {
        if (key && value) {
            await context.updateState({ [key]: value })
            console.log(`Updated state for user ${context.userId}: ${key} = ${value}`)
        }
    }

    private async nextQuestion(context: CommandContext): Promise<void> {
        const userId = context.userId
        const surveyData = this.surveyData.get(userId)
        
        if (surveyData && surveyData.active) {
            surveyData.currentQuestion += 1
            this.surveyData.set(userId, surveyData)
            
            console.log(`Next question for user ${userId}: ${surveyData.currentQuestion}`)
        }
    }

    getSurveyData(userId: string): any {
        return this.surveyData.get(userId)
    }

    isUserInSurvey(userId: string): boolean {
        const surveyData = this.surveyData.get(userId)
        return surveyData?.active || false
    }
}
export interface MentalHealthResponse {
    questionId: number
    question: string
    answer: string
    timestamp: Date
    analysisNote?: string
}

export interface DigitalSignals {
    responseSpeed: number[] // velocidad de respuesta en segundos
    messageLength: number[] // longitud de mensajes
    emojiUsage: number // cantidad de emojis usados
    formalityLevel: number // nivel de formalidad (1-5)
    pausePatterns: number[] // tiempo entre mensajes
    errorCorrections: number // autocorrecciones detectadas
    audioUsage: number // cantidad de mensajes de audio vs texto
}

export interface MentalHealthAssessment {
    userId: string
    responses: MentalHealthResponse[]
    digitalSignals: DigitalSignals
    stressLevel: 'bajo' | 'moderado' | 'alto'
    depressionIndicators: string[]
    recommendedBenefit: string
    riskLevel: 'bajo' | 'moderado' | 'alto'
    completedAt: Date
}

export class MentalHealthService {
    private assessments: Map<string, Partial<MentalHealthAssessment> & { selectedQuestions?: string[] }> = new Map()
    
    private stressDepressionQuestions = [
        "¿Cómo describirías tu estado de ánimo general durante tu jornada laboral? ¿Te sientes motivado, neutral o más bien desanimado?",
        "En las últimas semanas, ¿cómo ha sido tu calidad de sueño? ¿Duermes las horas necesarias y descansas bien?",
        "Durante tu día de trabajo, ¿cómo son tus niveles de energía? ¿Te sientes con fuerzas o experimentas cansancio frecuente?",
        "¿Cómo evaluarías tu capacidad de concentración y productividad en el trabajo últimamente?",
        "¿Has notado cambios en tus hábitos alimenticios o en el consumo de café, alcohol u otras sustancias desde que trabajas aquí?",
        "¿Con qué frecuencia tienes pensamientos ansiosos o negativos relacionados con tu trabajo o futuro profesional?",
        "¿Cómo te sientes respecto a tu entorno laboral y las relaciones con tus compañeros o supervisores?",
        "Cuando enfrentas situaciones de presión o conflicto en el trabajo, ¿experimentas reacciones físicas como palpitaciones, tensión muscular o dolor de cabeza?",
        "¿Has notado cambios en tu rendimiento laboral o cometes errores con más frecuencia que antes?",
        "¿Qué estrategias usas para manejar el estrés laboral y qué tipo de apoyo recibes de familia, amigos o compañeros?"
    ]

    private benefits = [
        "Suscripción Pase de batalla - Gamer",
        "Tour en Bicicleta - Deporte",
        "Asesoría Viajes - Lifestyle",
        "Sesión Salud Mental Niños y Adultos - Autocuidado",
        "Entrada Museo Interactivo Mirador - Panoramas y Familia",
        "Rally Karting - Deporte",
        "Go Karting - Deporte",
        "Speerpark - Deporte",
        "Plan Entrenamiento Mensual - Deporte",
        "Caja Maifud Fruras y Verduras - Lifestyle",
        "Pack 5 Shots Wake Up KEFFI - Lifestyle",
        "Libro Pasaporte Literario - Cultura y Artes",
        "Box Figuras Yeso - Cultura y Artes",
        "Pack Café Adictos - Lifestyle",
        "Pack Té Adictos - Lifestyle",
        "Pack Chocolates - Lifestyle",
        "Eleva tu inglés - Vida Profesional",
        "Coaching de carrera - Vida Profesional",
        "Caja de cremas y maquillaje - Autocuidado",
        "Ramen Ryoma - Comidas del mundo",
        "Mirai Food - Comidas del mundo",
        "Loquissima Pasta - Comidas del mundo",
        "Tijuana Tacos - Comidas del mundo",
        "Rishtedar Hindú - Comidas del mundo",
        "Gohan a domicilio - Comidas del mundo",
        "Burger a domicilio - Comidas del mundo",
        "Sandwich a domicilio - Comidas del mundo",
        "Comida China a domicilio - Comidas del Mundo",
        "Manicure Esmaltado Tradicional - Autocuidado",
        "Manicure Infantil - Autocuidado",
        "Perfilación de cejas - Autocuidado",
        "Car washing - Mundo tuercas",
        "Caja sorpresa para tu mascota - Mascotas",
        "Spa de mascota - Mascotas",
        "Sesión con nutricionista - Autocuidado",
        "Jumper Park Santiago - Panoramas y Familia",
        "Trampolin Park Santiago - Panoramas y Familia",
        "Bar On Tap - Cervezas y Amigos",
        "Bar y Vuelvo - Cervezas y Amigos",
        "Bar ChaChan - Cervezas y Amigos",
        "Inicia tu viaje en la fotografía - Hobbies y Pasatiempos",
        "Comienza tu viaje en el dibujo - Hobbies y Pasatiempos",
        "Planetario Santiago - Cultura y Arte",
        "Teatro Matucana 100 - Cultura y Arte",
        "Eventos del mes - Cultura y Arte"
    ]

    startAssessment(userId: string): string {
        this.assessments.set(userId, {
            userId,
            responses: [],
            digitalSignals: {
                responseSpeed: [],
                messageLength: [],
                emojiUsage: 0,
                formalityLevel: 3,
                pausePatterns: [],
                errorCorrections: 0,
                audioUsage: 0
            }
        })

        return `Hola, soy tu asistente especializado en bienestar laboral. 

Me gustaría ayudarte a conocer mejor tu estado emocional en el trabajo y recomendarte beneficios personalizados que podrían ser útiles para ti.

**¿Me das tu consentimiento para recopilar información sobre tu estado emocional, hábitos laborales e intereses?**

Esta información se usará exclusivamente para:
- Generar un modelo digital de tu salud mental laboral
- Hacer una recomendación personalizada de beneficio
- Todo será tratado con absoluta confidencialidad

*Nota: Esto no constituye un diagnóstico médico profesional.*

¿Estás de acuerdo en continuar?`
    }

    async processResponse(userId: string, answer: string, metadata: { isAudio: boolean, responseTime: number }): Promise<string> {
        const assessment = this.assessments.get(userId)
        if (!assessment) {
            return "Por favor, primero acepta participar en la evaluación escribiendo 'sí' o 'acepto'."
        }

        // Actualizar señales digitales
        this.updateDigitalSignals(assessment, answer, metadata)

        const currentQuestionIndex = assessment.responses?.length || 0

        // Si es la primera respuesta, verificar consentimiento
        if (currentQuestionIndex === 0) {
            if (!this.isConsentGiven(answer)) {
                return "Entiendo. Si cambias de opinión, puedes escribir 'evaluar salud mental' cuando gustes. ¿En qué más puedo ayudarte?"
            }
            
            // Consentimiento dado, hacer primera pregunta
            const selectedQuestions = this.selectRandomQuestions()
            assessment.selectedQuestions = selectedQuestions
            
            const firstQuestion = selectedQuestions[0]
            assessment.responses!.push({
                questionId: 0,
                question: "consentimiento",
                answer: answer,
                timestamp: new Date()
            })

            return `¡Perfecto! Muchas gracias por tu confianza. 

**Pregunta 1 de 6:**
${firstQuestion}`
        }

        // Procesar respuesta a pregunta específica
        const questionIndex = currentQuestionIndex - 1 // -1 por el consentimiento
        const selectedQuestions = assessment.selectedQuestions!
        
        if (questionIndex < 5) {
            // Guardar respuesta actual
            assessment.responses!.push({
                questionId: questionIndex + 1,
                question: selectedQuestions[questionIndex],
                answer: answer,
                timestamp: new Date(),
                analysisNote: this.generateQuickAnalysis(answer, questionIndex)
            })

            const analysisNote = this.generateQuickAnalysis(answer, questionIndex)
            
            if (questionIndex < 4) {
                // Siguiente pregunta (preguntas 2-5)
                const nextQuestion = selectedQuestions[questionIndex + 1]
                return `Gracias por compartir esa información. ${analysisNote}

**Pregunta ${questionIndex + 2} de 6:**
${nextQuestion}`
            } else {
                // Pregunta 6 (intereses)
                return `Gracias por compartir esa información. ${analysisNote}

**Pregunta 6 de 6:**
¿Con qué categoría de actividades te identificas más para tu tiempo libre?

a) Deportes y actividad física
b) Vida social y entretenimiento 
c) Cultura, arte y aprendizaje
d) Autocuidado y bienestar personal
e) Hobbies creativos y pasatiempos
f) Gastronomía y experiencias culinarias
g) Familia y actividades con niños
h) Desarrollo profesional
i) Tecnología y gaming`
            }
        } else {
            // Respuesta final (intereses) - generar informe
            assessment.responses!.push({
                questionId: 6,
                question: "categoría de intereses",
                answer: answer,
                timestamp: new Date()
            })

            return await this.generateFinalReport(userId)
        }
    }

    private selectRandomQuestions(): string[] {
        // Seleccionar 5 preguntas aleatorias de las 10 disponibles
        const shuffled = [...this.stressDepressionQuestions].sort(() => 0.5 - Math.random())
        return shuffled.slice(0, 5)
    }

    private isConsentGiven(answer: string): boolean {
        const positive = ['sí', 'si', 'acepto', 'ok', 'está bien', 'de acuerdo', 'yes', 'dale', 'por supuesto']
        return positive.some(word => answer.toLowerCase().includes(word))
    }

    private updateDigitalSignals(assessment: Partial<MentalHealthAssessment>, answer: string, metadata: { isAudio: boolean, responseTime: number }) {
        if (!assessment.digitalSignals) return

        assessment.digitalSignals.responseSpeed.push(metadata.responseTime)
        assessment.digitalSignals.messageLength.push(answer.length)
        assessment.digitalSignals.emojiUsage += (answer.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu) || []).length
        
        if (metadata.isAudio) {
            assessment.digitalSignals.audioUsage++
        }

        // Analizar nivel de formalidad (básico)
        const formalWords = ['usted', 'señor', 'señora', 'estimado', 'cordialmente']
        const informalWords = ['jaja', 'xd', 'jeje', 'onda', 'bacán', 'genial']
        
        const formalCount = formalWords.filter(word => answer.toLowerCase().includes(word)).length
        const informalCount = informalWords.filter(word => answer.toLowerCase().includes(word)).length
        
        if (formalCount > informalCount) {
            assessment.digitalSignals.formalityLevel = Math.min(5, assessment.digitalSignals.formalityLevel + 0.5)
        } else if (informalCount > formalCount) {
            assessment.digitalSignals.formalityLevel = Math.max(1, assessment.digitalSignals.formalityLevel - 0.5)
        }
    }

    private generateQuickAnalysis(answer: string, questionIndex: number): string {
        const analyses = [
            "Noto que estás reflexionando sobre tu estado emocional, esto es muy positivo para el autoconocimiento.",
            "El sueño es fundamental para el bienestar mental, gracias por ser honesto sobre este aspecto.",
            "Los niveles de energía nos dicen mucho sobre cómo estamos manejando las demandas laborales.",
            "La concentración y productividad son indicadores clave de nuestro bienestar cognitivo.",
            "Los cambios en hábitos pueden ser señales importantes de cómo el trabajo nos está afectando."
        ]
        
        return analyses[questionIndex] || "Gracias por compartir esta información tan valiosa."
    }

    private async generateFinalReport(userId: string): Promise<string> {
        const assessment = this.assessments.get(userId)!
        
        // Análisis de riesgo
        const riskAnalysis = this.analyzeRisk(assessment.responses!)
        const recommendedBenefit = this.recommendBenefit(assessment.responses!)
        
        // Completar assessment
        assessment.stressLevel = riskAnalysis.stressLevel
        assessment.depressionIndicators = riskAnalysis.indicators
        assessment.recommendedBenefit = recommendedBenefit
        assessment.riskLevel = riskAnalysis.riskLevel
        assessment.completedAt = new Date()

        // Resumen de respuestas
        const responseSummary = assessment.responses!
            .filter(r => r.questionId > 0)
            .map(r => `**Pregunta ${r.questionId}:** ${r.answer}`)
            .join('\n\n')

        // Informe principal
        const mainReport = this.generateMainReport(assessment as MentalHealthAssessment)
        
        // Informe de señales digitales
        const digitalReport = this.generateDigitalSignalsReport(assessment.digitalSignals!)

        return `## EVALUACIÓN COMPLETADA ✅

### Resumen de tus respuestas:
${responseSummary}

---

${mainReport}

---

${digitalReport}

*Recuerda: Esta evaluación no constituye un diagnóstico médico. Si sientes que necesitas apoyo adicional, no dudes en contactar a un profesional de la salud mental.*`
    }

    private analyzeRisk(responses: MentalHealthResponse[]): { stressLevel: 'bajo' | 'moderado' | 'alto', indicators: string[], riskLevel: 'bajo' | 'moderado' | 'alto' } {
        let riskScore = 0
        const indicators: string[] = []

        responses.forEach(response => {
            const answer = response.answer.toLowerCase()
            
            // Indicadores de riesgo
            if (answer.includes('triste') || answer.includes('desanimado') || answer.includes('deprimido')) {
                riskScore += 2
                indicators.push('Estado de ánimo bajo')
            }
            
            if (answer.includes('no duermo') || answer.includes('insomnio') || answer.includes('mal sueño')) {
                riskScore += 2
                indicators.push('Problemas de sueño')
            }
            
            if (answer.includes('cansado') || answer.includes('sin energía') || answer.includes('agotado')) {
                riskScore += 1
                indicators.push('Fatiga frecuente')
            }
            
            if (answer.includes('no me concentro') || answer.includes('distraído') || answer.includes('productividad baja')) {
                riskScore += 1
                indicators.push('Dificultades de concentración')
            }
            
            if (answer.includes('ansioso') || answer.includes('estresado') || answer.includes('preocupado')) {
                riskScore += 2
                indicators.push('Síntomas de ansiedad')
            }
        })

        const riskLevel: 'bajo' | 'moderado' | 'alto' = riskScore <= 2 ? 'bajo' : riskScore <= 5 ? 'moderado' : 'alto'
        const stressLevel: 'bajo' | 'moderado' | 'alto' = riskLevel

        return { stressLevel, indicators, riskLevel }
    }

    private recommendBenefit(responses: MentalHealthResponse[]): string {
        const interestsResponse = responses.find(r => r.questionId === 6)?.answer.toLowerCase() || ''
        const riskAnalysis = this.analyzeRisk(responses)

        // Si hay alto riesgo, priorizar autocuidado
        if (riskAnalysis.riskLevel === 'alto') {
            return "Sesión Salud Mental Niños y Adultos - Autocuidado"
        }

        // Mapear intereses a beneficios
        if (interestsResponse.includes('a') || interestsResponse.includes('deporte')) {
            return "Plan Entrenamiento Mensual - Deporte"
        }
        
        if (interestsResponse.includes('b') || interestsResponse.includes('social')) {
            return "Bar On Tap - Cervezas y Amigos"
        }
        
        if (interestsResponse.includes('c') || interestsResponse.includes('cultura') || interestsResponse.includes('arte')) {
            return "Teatro Matucana 100 - Cultura y Arte"
        }
        
        if (interestsResponse.includes('d') || interestsResponse.includes('autocuidado') || interestsResponse.includes('bienestar')) {
            return "Sesión con nutricionista - Autocuidado"
        }
        
        if (interestsResponse.includes('e') || interestsResponse.includes('hobbies') || interestsResponse.includes('creativos')) {
            return "Inicia tu viaje en la fotografía - Hobbies y Pasatiempos"
        }
        
        if (interestsResponse.includes('f') || interestsResponse.includes('gastronomía') || interestsResponse.includes('comida')) {
            return "Ramen Ryoma - Comidas del mundo"
        }
        
        if (interestsResponse.includes('g') || interestsResponse.includes('familia') || interestsResponse.includes('niños')) {
            return "Jumper Park Santiago - Panoramas y Familia"
        }
        
        if (interestsResponse.includes('h') || interestsResponse.includes('profesional') || interestsResponse.includes('desarrollo')) {
            return "Coaching de carrera - Vida Profesional"
        }
        
        if (interestsResponse.includes('i') || interestsResponse.includes('tecnología') || interestsResponse.includes('gaming')) {
            return "Suscripción Pase de batalla - Gamer"
        }

        // Default
        return "Pack Chocolates - Lifestyle"
    }

    private generateMainReport(assessment: MentalHealthAssessment): string {
        const riskText = assessment.riskLevel === 'alto' ? 'ALTO' : assessment.riskLevel === 'moderado' ? 'MODERADO' : 'BAJO'
        const indicators = assessment.depressionIndicators.length > 0 ? assessment.depressionIndicators.join(', ') : 'No se detectaron indicadores significativos'
        
        const professionalAdvice = assessment.riskLevel === 'alto' 
            ? "\n\n⚠️ **RECOMENDACIÓN IMPORTANTE**: Dado el nivel de riesgo detectado, te recomendamos encarecidamente buscar apoyo de un profesional de salud mental."
            : ""

        return `## INFORME DE EVALUACIÓN DE SALUD MENTAL LABORAL

### 1. Resumen de Hallazgos Emocionales y Conductuales
**Nivel de riesgo detectado: ${riskText}**

Indicadores identificados: ${indicators}

### 2. Modelo Digital de Salud Mental
Basado en tus respuestas, se observa un patrón de comportamiento que indica ${assessment.stressLevel} nivel de estrés laboral. Los patrones de respuesta sugieren ${assessment.depressionIndicators.length > 0 ? 'algunas áreas de atención' : 'un estado emocional dentro de parámetros normales'} en el contexto laboral.

### 3. Recomendación de Beneficio
**Beneficio recomendado:** ${assessment.recommendedBenefit}

**Justificación:** Este beneficio ha sido seleccionado considerando tu perfil de intereses y tu estado emocional actual, con el objetivo de contribuir a tu bienestar general y equilibrio vida-trabajo.${professionalAdvice}`
    }

    private generateDigitalSignalsReport(signals: DigitalSignals): string {
        const avgResponseTime = signals.responseSpeed.reduce((a, b) => a + b, 0) / signals.responseSpeed.length || 0
        const avgMessageLength = signals.messageLength.reduce((a, b) => a + b, 0) / signals.messageLength.length || 0
        
        return `## ANÁLISIS DE SEÑALES DIGITALES

### Métricas de Comportamiento Digital:
- **Velocidad de respuesta promedio:** ${avgResponseTime.toFixed(1)} segundos
- **Longitud promedio de mensajes:** ${avgMessageLength.toFixed(0)} caracteres
- **Uso de emojis:** ${signals.emojiUsage} emojis utilizados
- **Nivel de formalidad:** ${signals.formalityLevel.toFixed(1)}/5
- **Uso de audio:** ${signals.audioUsage} mensajes de voz

### Correlación con Indicadores Emocionales:
${this.correlateDigitalSignals(signals)}`
    }

    private correlateDigitalSignals(signals: DigitalSignals): string {
        const insights: string[] = []
        
        const avgResponseTime = signals.responseSpeed.reduce((a, b) => a + b, 0) / signals.responseSpeed.length || 0
        
        if (avgResponseTime > 30) {
            insights.push("• Tiempo de respuesta elevado podría indicar reflexión profunda o posible ansiedad al responder")
        }
        
        if (signals.emojiUsage === 0) {
            insights.push("• Ausencia de emojis puede sugerir estado emocional más reservado o formal")
        } else if (signals.emojiUsage > 3) {
            insights.push("• Uso frecuente de emojis indica expresividad emocional y apertura comunicativa")
        }
        
        if (signals.formalityLevel > 4) {
            insights.push("• Alto nivel de formalidad puede indicar distancia emocional o profesionalismo defensive")
        }
        
        if (signals.audioUsage > 2) {
            insights.push("• Preferencia por mensajes de voz sugiere comodidad expresiva y naturalidad comunicativa")
        }
        
        return insights.length > 0 ? insights.join('\n') : "• Los patrones digitales muestran un comportamiento comunicativo estándar"
    }

    isUserInMentalHealthAssessment(userId: string): boolean {
        const assessment = this.assessments.get(userId)
        return !!(assessment && !assessment.completedAt)
    }

    getUserAssessment(userId: string): Partial<MentalHealthAssessment> | undefined {
        return this.assessments.get(userId)
    }
}
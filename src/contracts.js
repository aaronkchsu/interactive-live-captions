/**
 * All events belong to one owner and session. Local identity is not hosted authentication.
 * @typedef {{streamerId: string, sessionId: string}} Context
 * @typedef {Context & {segmentId: string, sequence: number, revision: number, text: string, final: boolean, captureId: string}} SpeechEvent
 * @typedef {Context & {id:string, sequence:number, revision:number, source:string, final:boolean, at:number, expiresAt:number}} SpeechSegment
 * @typedef {Context & {segmentId:string, sourceRevision:number, targetLanguage:string, generation:number, status:string, text:string}} TranslationResult
 * @typedef {Context & {id: string, kind: 'observation'|'chorus'|'fiction', text: string, event?: string, language: string, observedAt: number, expiresAt: number, evidence: string[], origin: 'live'|'demo'}} Cue
 * @typedef {Context & {id: string, durationMs?:number, kind: 'mode'|'style'|'language'|'reset', value?: string, moderator: boolean, origin: string, actor: string}} CommunityAction
 * @typedef {{now: () => number}} Clock
 */
export const protocolVersion = 2;

/**
 * @typedef {Object} Settings
 * @property {string} style
 * @property {string} language
 * @property {string} display
 * @property {number} fontSize
 * @property {string} position
 * @property {number} hold
 * @property {number} backplate
 * @property {boolean} emphasis
 * @property {boolean} reducedMotion
 * @property {boolean} safeArea
 * @property {string} format
 * @property {number} cooldown
 * @property {string} preset
 * @property {string} secondaryLanguage
 * @property {string} secondaryPosition
 * @property {string} chaosPlacement
 * @property {string} chorusTone
 * @property {string[]} allowedModes
 * @property {string} microphoneId
 * @property {string} cameraId
 * @property {boolean} cameraEnabled
 * @property {{x:number,y:number,width:number,height:number}} crop
 * @property {Record<string,string>} rewardMappings
 * @property {boolean} setupComplete
 */

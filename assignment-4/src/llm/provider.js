/**
 * @typedef {object} ToolCall
 * @property {string} id
 * @property {string} name
 * @property {Record<string, unknown>} arguments
 * @property {string} [thoughtSignature] Gemini 2.5+ requires replaying this on multi-turn tool loops
 */

/**
 * @typedef {object} ContentPart
 * @property {'text'} type
 * @property {string} text
 */

/**
 * @typedef {object} ImagePart
 * @property {'image'} type
 * @property {string} mimeType
 * @property {string} data
 */

/**
 * @typedef {object} ChatMessage
 * @property {'system'|'user'|'assistant'|'tool'} role
 * @property {string | Array<ContentPart|ImagePart>} [content]
 * @property {ToolCall[]} [toolCalls]
 * @property {string} [toolCallId]
 * @property {string} [name]
 */

/**
 * @typedef {object} ChatResult
 * @property {string} [content]
 * @property {ToolCall[]} [toolCalls]
 * @property {'stop'|'tool_calls'} finishReason
 */

/**
 * @typedef {object} ToolSchema
 * @property {string} name
 * @property {string} description
 * @property {Record<string, unknown>} parameters
 */

/**
 * @typedef {object} ChatOptions
 * @property {ChatMessage[]} messages
 * @property {ToolSchema[]} [tools]
 * @property {string} model
 */

export class LLMProvider {
  /** @param {ChatOptions} _options */
  async chat(_options) {
    throw new Error("Not implemented");
  }

  supportsToolCalling() {
    return true;
  }

  supportsVision() {
    return false;
  }
}
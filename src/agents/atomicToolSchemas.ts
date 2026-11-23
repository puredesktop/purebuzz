import type {
  AppAtomicToolDefinition,
  AppOperationExposure,
  AppOperationRisk,
} from '@purescience/platform-ui/bridge/appFunctions'

/**
 * Lossless catalog of all 10 PureBuzz atomic tool schemas extracted from `plugin.json`.
 *
 * Each entry declares:
 *   - `category`: clean domain grouping for `discoverAppTools`
 *   - `exposure`: `'always'` (2 core read tools + all 3 release tools) or `'extended'` (5 specialist read tools)
 *   - explicit `risk` and `requiresApproval` satisfying `scripts/check-manifests.mjs`
 */
export type PureBuzzAtomicToolSchema = Omit<
  AppAtomicToolDefinition<unknown>,
  'opClass' | 'run'
> & {
  exposure: AppOperationExposure
  risk: AppOperationRisk
}

export const PUREBUZZ_ATOMIC_TOOL_SCHEMAS: readonly PureBuzzAtomicToolSchema[] =
  [
    // ---- Core & Release atomic tools (exposure: 'always') ------------------
    {
      name: 'getBuzzContext',
      category: 'context',
      exposure: 'always',
      risk: 'read',
      requiresApproval: false,
      description:
        'Current Buzz state: connection status, relay, own identity (npub and display name), the active channel, and which channels have unread messages.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'readMessages',
      category: 'messages',
      exposure: 'always',
      risk: 'read',
      requiresApproval: false,
      description:
        'Read recent messages from a channel or DM, oldest first: author display name, text, ISO timestamp, attachments by name, and reply references. Edits and deletions are applied for the channel currently open in the app; other channels return the raw history.',
      inputSchema: {
        type: 'object',
        properties: {
          channelId: {
            type: 'string',
            description:
              'Channel id from listChannels. Defaults to the active channel.',
          },
          limit: {
            type: 'number',
            description: 'Maximum messages (default 50, newest kept).',
          },
        },
      },
    },
    {
      name: 'sendMessage',
      category: 'messaging',
      exposure: 'always',
      releaseButton: 'Send',
      risk: 'release',
      requiresApproval: true,
      description:
        'Post a message to a channel or DM as the user. The message is signed with their identity and visible to every member \u2014 use exactly the text the user approved. A release action: only a person can post, by pressing Send in Buzz, or by approving it as CEO in the Executive team. An agent cannot call this at any trust level; write the text in the conversation for the person to send.',
      inputSchema: {
        type: 'object',
        properties: {
          channelId: {
            type: 'string',
            description:
              'Channel id from listChannels. Defaults to the active channel.',
          },
          text: {
            type: 'string',
            description:
              'Message text (markdown subset: links, bold, italic, code).',
          },
        },
        required: ['text'],
      },
    },
    {
      name: 'sendDirectMessage',
      category: 'messaging',
      exposure: 'always',
      releaseButton: 'Send',
      risk: 'release',
      requiresApproval: true,
      description:
        "Send a direct message to one person as the user, opening the DM channel first if it does not exist. The message is signed with the user's identity \u2014 use exactly the text the user approved. A release action: only a person can post, by pressing Send in Buzz, or by approving it as CEO in the Executive team. An agent cannot call this at any trust level; write the text in the conversation for the person to send.",
      inputSchema: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description:
              'Who to message: a display name (see listMembers), an npub, or a hex key.',
          },
          text: {
            type: 'string',
            description:
              'Message text (markdown subset: links, bold, italic, code).',
          },
        },
        required: ['to', 'text'],
      },
    },
    {
      name: 'sendMediaFile',
      category: 'media',
      exposure: 'always',
      releaseButton: 'Send',
      risk: 'release',
      requiresApproval: true,
      description:
        'Upload a local file to the relay media store and post it to a channel as the user, with an optional caption. Call getBuzzContext first to verify relay connection and channel state. Signed with their identity; images are re-encoded to strip metadata. A release action: only a person can post, by pressing Send in Buzz, or by approving it as CEO in the Executive team. An agent cannot call this at any trust level; write the text in the conversation for the person to send.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path of the file to send (max 10MB).',
          },
          channelId: {
            type: 'string',
            description: 'Channel id. Defaults to the active channel.',
          },
          caption: {
            type: 'string',
            description: 'Text to send with the file.',
          },
        },
        required: ['path'],
      },
    },

    // ---- Extended specialist atomic tools (exposure: 'extended') -----------
    {
      name: 'listChannels',
      category: 'channels',
      exposure: 'extended',
      risk: 'read',
      requiresApproval: false,
      description:
        'List every channel and direct-message conversation: id, name, type (channel|dm), visibility (open|private), member count, and whether it has unread messages.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'searchMessages',
      category: 'search',
      exposure: 'extended',
      risk: 'read',
      requiresApproval: false,
      description:
        'Full-text search within one channel via the relay. Returns matching messages, newest first.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search terms.',
          },
          channelId: {
            type: 'string',
            description:
              'Channel id to search. Defaults to the active channel.',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'listMembers',
      category: 'people',
      exposure: 'extended',
      risk: 'read',
      requiresApproval: false,
      description:
        "A channel's member roster: display name, npub, role, and whether they are online right now.",
      inputSchema: {
        type: 'object',
        properties: {
          channelId: {
            type: 'string',
            description: 'Channel id. Defaults to the active channel.',
          },
        },
      },
    },
    {
      name: 'latestMessages',
      category: 'messages',
      exposure: 'extended',
      risk: 'read',
      requiresApproval: false,
      description:
        'The newest messages, newest first \u2014 from one channel, from one person across every channel, or both. "from" accepts a display name, npub, or hex key.',
      inputSchema: {
        type: 'object',
        properties: {
          channelId: {
            type: 'string',
            description:
              'Channel id. Defaults to the active channel; omit together with "from" to search a person across all channels.',
          },
          from: {
            type: 'string',
            description:
              'Only messages by this person \u2014 display name, npub, or hex key.',
          },
          count: {
            type: 'number',
            description: 'How many (default 5, max 50).',
          },
        },
      },
    },
    {
      name: 'listMedia',
      category: 'media',
      exposure: 'extended',
      risk: 'read',
      requiresApproval: false,
      description:
        'Files and images posted in a channel: url, mime type, author, timestamp, message id. Optionally filtered to one person (display name, npub, or hex key).',
      inputSchema: {
        type: 'object',
        properties: {
          channelId: {
            type: 'string',
            description: 'Channel id. Defaults to the active channel.',
          },
          from: {
            type: 'string',
            description: 'Only media posted by this person.',
          },
          limit: {
            type: 'number',
            description: 'Maximum entries (default 25, newest kept).',
          },
        },
      },
    },
  ]

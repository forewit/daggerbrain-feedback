import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  InteractionContextType,
  type APIApplicationCommandOption,
  type APIApplicationCommandBasicOption,
  type RESTPutAPIApplicationCommandsJSONBody
} from 'discord-api-types/v10'

function attachmentOption(name: string, description: string): APIApplicationCommandBasicOption {
  return {
    type: ApplicationCommandOptionType.Attachment,
    name,
    description,
    required: false
  }
}

function descriptionOption(kind: string): APIApplicationCommandBasicOption {
  return {
    type: ApplicationCommandOptionType.String,
    name: 'description',
    description: `Describe the ${kind}`,
    required: false
  }
}

function bugIdOption(name: string, description: string): APIApplicationCommandBasicOption {
  return {
    type: ApplicationCommandOptionType.Integer,
    name,
    description,
    required: true,
    autocomplete: true
  }
}

function featureIdOption(name: string, description: string): APIApplicationCommandBasicOption {
  return {
    type: ApplicationCommandOptionType.Integer,
    name,
    description,
    required: true,
    autocomplete: true
  }
}

function bugSubcommands(): APIApplicationCommandOption[] {
  return [
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'report',
      description: 'Report a bug',
      options: [descriptionOption('bug'), attachmentOption('attachment', 'Optional screenshot or screen recording')]
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'top',
      description: 'Show the highest-voted open bugs'
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'mine',
      description: 'Show your recent bug reports'
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'status',
      description: 'Update bug status',
      options: [
        bugIdOption('bug_id', 'Bug to update'),
        {
          type: ApplicationCommandOptionType.String,
          name: 'status',
          description: 'Next status',
          required: true,
          autocomplete: true
        },
        {
          type: ApplicationCommandOptionType.String,
          name: 'note',
          description: 'Optional status note',
          required: false
        }
      ]
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'link',
      description: 'Link a bug as duplicate or regression',
      options: [
        bugIdOption('bug_id', 'Bug to update'),
        bugIdOption('target_bug_id', 'Target bug'),
        {
          type: ApplicationCommandOptionType.String,
          name: 'relation',
          description: 'How this bug relates to the target',
          required: true,
          choices: [
            { name: 'duplicate', value: 'duplicate' },
            { name: 'regression', value: 'regression' }
          ]
        }
      ]
    }
  ]
}

function feedbackSubcommands(): APIApplicationCommandOption[] {
  return [
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'report',
      description: 'Share product feedback',
      options: [descriptionOption('feedback'), attachmentOption('attachment', 'Optional mockup or screenshot')]
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'top',
      description: 'Show the highest-voted open feedback'
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'mine',
      description: 'Show your recent feedback submissions'
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'status',
      description: 'Update feedback status',
      options: [
        featureIdOption('feature_id', 'Feedback item to update'),
        {
          type: ApplicationCommandOptionType.String,
          name: 'status',
          description: 'Next status',
          required: true,
          autocomplete: true
        },
        {
          type: ApplicationCommandOptionType.String,
          name: 'note',
          description: 'Optional status note',
          required: false
        }
      ]
    }
  ]
}

function roadmapSubcommands(): APIApplicationCommandOption[] {
  const featureOptions: APIApplicationCommandBasicOption[] = Array.from({ length: 5 }, (_, index) => ({
    type: ApplicationCommandOptionType.Integer,
    name: `feature_${index + 1}`,
    description: `Roadmap feature ${index + 1}`,
    required: index < 2,
    autocomplete: true
  }))

  return [
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'list',
      description: 'Show planned and in-progress roadmap items'
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'poll',
      description: 'Create a roadmap prioritization poll',
      options: [
        {
          type: ApplicationCommandOptionType.String,
          name: 'title',
          description: 'Poll title',
          required: true
        },
        ...featureOptions
      ]
    }
  ]
}

export function buildApplicationCommands(manageMessagesPermission: string): RESTPutAPIApplicationCommandsJSONBody {
  return [
    {
      type: ApplicationCommandType.ChatInput,
      name: 'bug',
      description: 'Bug reporting and triage',
      integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
      contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
      options: bugSubcommands()
    },
    {
      type: ApplicationCommandType.ChatInput,
      name: 'feedback',
      description: 'Product feedback and roadmap',
      integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
      contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
      options: feedbackSubcommands()
    },
    {
      type: ApplicationCommandType.ChatInput,
      name: 'roadmap',
      description: 'Roadmap views and prioritization polls',
      integration_types: [ApplicationIntegrationType.GuildInstall],
      contexts: [InteractionContextType.Guild],
      options: roadmapSubcommands()
    },
    {
      type: ApplicationCommandType.ChatInput,
      name: 'topbugs',
      description: 'List the highest voted open bugs',
      integration_types: [ApplicationIntegrationType.GuildInstall],
      contexts: [InteractionContextType.Guild]
    },
    {
      type: ApplicationCommandType.ChatInput,
      name: 'bug-status',
      description: 'Update the status for an existing bug',
      default_member_permissions: manageMessagesPermission,
      integration_types: [ApplicationIntegrationType.GuildInstall],
      contexts: [InteractionContextType.Guild],
      options: [
        bugIdOption('bug_id', 'Bug to update'),
        {
          type: ApplicationCommandOptionType.String,
          name: 'status',
          description: 'Next status',
          required: true,
          autocomplete: true
        },
        {
          type: ApplicationCommandOptionType.String,
          name: 'note',
          description: 'Optional status note',
          required: false
        }
      ]
    },
    {
      type: ApplicationCommandType.ChatInput,
      name: 'bug-link',
      description: 'Link a bug as a duplicate or regression of another bug',
      default_member_permissions: manageMessagesPermission,
      integration_types: [ApplicationIntegrationType.GuildInstall],
      contexts: [InteractionContextType.Guild],
      options: [
        bugIdOption('bug_id', 'Bug to update'),
        bugIdOption('target_bug_id', 'Target bug'),
        {
          type: ApplicationCommandOptionType.String,
          name: 'relation',
          description: 'How this bug relates to the target',
          required: true,
          choices: [
            { name: 'duplicate', value: 'duplicate' },
            { name: 'regression', value: 'regression' }
          ]
        }
      ]
    },
    {
      type: ApplicationCommandType.Message,
      name: 'Report Message as Bug',
      integration_types: [ApplicationIntegrationType.GuildInstall],
      contexts: [InteractionContextType.Guild]
    },
    {
      type: ApplicationCommandType.Message,
      name: 'Turn Message into Feedback',
      integration_types: [ApplicationIntegrationType.GuildInstall],
      contexts: [InteractionContextType.Guild]
    }
  ]
}

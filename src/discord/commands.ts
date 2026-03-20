import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  InteractionContextType,
  type APIApplicationCommandOption,
  type APIApplicationCommandBasicOption,
  type RESTPutAPIApplicationCommandsJSONBody
} from 'discord-api-types/v10'

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

function bugsSubcommands(): APIApplicationCommandOption[] {
  return [
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

function suggestionsSubcommands(): APIApplicationCommandOption[] {
  return [
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'top',
      description: 'Show the highest-voted open suggestions'
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'mine',
      description: 'Show your recent suggestions'
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: 'status',
      description: 'Update suggestion status',
      options: [
        featureIdOption('feature_id', 'Suggestion to update'),
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

export function buildApplicationCommands(manageMessagesPermission: string): RESTPutAPIApplicationCommandsJSONBody {
  return [
    {
      type: ApplicationCommandType.ChatInput,
      name: 'bug',
      description: 'Open the bug report modal',
      integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
      contexts: [InteractionContextType.Guild, InteractionContextType.BotDM]
    },
    {
      type: ApplicationCommandType.ChatInput,
      name: 'bugs',
      description: 'Bug lists and triage actions',
      integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
      contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
      options: bugsSubcommands()
    },
    {
      type: ApplicationCommandType.ChatInput,
      name: 'suggestion',
      description: 'Open the suggestion modal',
      integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
      contexts: [InteractionContextType.Guild, InteractionContextType.BotDM]
    },
    {
      type: ApplicationCommandType.ChatInput,
      name: 'suggestions',
      description: 'Suggestion lists and status',
      integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
      contexts: [InteractionContextType.Guild, InteractionContextType.BotDM],
      options: suggestionsSubcommands()
    },
    {
      type: ApplicationCommandType.Message,
      name: 'Report Message as Bug',
      integration_types: [ApplicationIntegrationType.GuildInstall],
      contexts: [InteractionContextType.Guild]
    },
    {
      type: ApplicationCommandType.Message,
      name: 'Turn Message into Suggestion',
      integration_types: [ApplicationIntegrationType.GuildInstall],
      contexts: [InteractionContextType.Guild]
    }
  ]
}

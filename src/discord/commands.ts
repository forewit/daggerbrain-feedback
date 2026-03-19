import {
  ApplicationCommandOptionType,
  type RESTPutAPIApplicationCommandsJSONBody
} from 'discord-api-types/v10'

export function buildApplicationCommands(manageMessagesPermission: string): RESTPutAPIApplicationCommandsJSONBody {
  return [
    {
      name: 'bug',
      description: 'Report a bug',
      options: [
        {
          type: ApplicationCommandOptionType.String,
          name: 'description',
          description: 'Describe the bug'
        }
      ]
    },
    {
      name: 'feedback',
      description: 'Share product feedback',
      options: [
        {
          type: ApplicationCommandOptionType.String,
          name: 'description',
          description: 'Describe the feedback'
        }
      ]
    },
    { name: 'topbugs', description: 'List the highest voted open bugs' },
    {
      name: 'bug-status',
      description: 'Update the status for an existing bug',
      default_member_permissions: manageMessagesPermission,
      options: [
        {
          type: ApplicationCommandOptionType.Integer,
          name: 'bug_id',
          description: 'Bug ID to update',
          required: true
        },
        {
          type: ApplicationCommandOptionType.String,
          name: 'status',
          description: 'New status',
          required: true,
          choices: [
            { name: 'OPEN', value: 'OPEN' },
            { name: 'IN_PROGRESS', value: 'IN_PROGRESS' },
            { name: 'FIXED', value: 'FIXED' },
            { name: 'CLOSED', value: 'CLOSED' },
            { name: 'DUPLICATE', value: 'DUPLICATE' }
          ]
        }
      ]
    },
    {
      name: 'bug-link',
      description: 'Link a bug as a duplicate or regression of another bug',
      default_member_permissions: manageMessagesPermission,
      options: [
        {
          type: ApplicationCommandOptionType.Integer,
          name: 'bug_id',
          description: 'Bug ID to update',
          required: true
        },
        {
          type: ApplicationCommandOptionType.Integer,
          name: 'target_bug_id',
          description: 'Target bug ID',
          required: true
        },
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

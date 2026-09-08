import type { Canonical } from "../../schema/character";
import type { AgentName } from "../prompts";
export function buildContext(
  c: Canonical,
  agent: AgentName,
  requirements = "",
) {
  switch (agent) {
    case "GreetingDirector":
      return {
        character: {
          name: c.character.name,
          description: c.character.description,
          basic: c.character.basic,
          appearance: c.character.appearance,
          personality: c.character.personality,
          speechStyle: c.character.speechStyle,
          behavior: c.character.behavior,
          userRelationship: c.character.userRelationship,
          relationships: c.character.relationships,
          rules: c.character.rules,
        },
        scenario: c.scenario,
        greetings: c.greetings,
        lore: c.lorebook.entries
          .filter(
            (e) =>
              e.enabled &&
              (e.constant ||
                e.keys.some((key) =>
                  (
                    requirements +
                    " " +
                    c.scenario +
                    " " +
                    c.character.description
                  )
                    .toLocaleLowerCase()
                    .includes(key.toLocaleLowerCase()),
                )),
          )
          .slice(0, 12),
      };
    case "LorebookArchitect":
      return { character: c.character, worlds: c.worlds, lorebook: c.lorebook };
    case "WorldArchitect":
      return {
        character: {
          name: c.character.name,
          background: c.character.background,
          description: c.character.description,
        },
        worlds: c.worlds,
      };
    case "ImageAnalyst":
      return {
        character: {
          name: c.character.name,
          appearance: c.character.appearance,
        },
      };
    case "EvidenceExtraction":
      return { character: { name: c.character.name } };
    case "DialogueDesigner":
      return { character: c.character, scenario: c.scenario };
    case "CharacterArchitect":
      return { character: c.character, scenario: c.scenario };
    default: {
      const { author, passthrough, ...rest } = c;
      return rest;
    }
  }
}

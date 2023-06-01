import type {
  TmplAstBoundAttribute,
  TmplAstBoundEvent,
  TmplAstElement,
  TmplAstTextAttribute,
} from '@angular-eslint/bundled-angular-compiler';
import { getTemplateParserServices } from '@angular-eslint/utils';
import { createESLintRule } from '../utils/create-eslint-rule';
import { getOriginalAttributeName } from '../utils/get-original-attribute-name';

type Options = [
  {
    readonly allowTwoWayDataBinding?: boolean;
    readonly allowAngularStylePrecedenceDuplicates?: boolean;
    readonly ignore?: readonly string[];
  },
];
export type MessageIds = 'noDuplicateAttributes' | 'suggestRemoveAttribute';
export const RULE_NAME = 'no-duplicate-attributes';
const DEFAULT_OPTIONS: Options[number] = {
  allowTwoWayDataBinding: true,
  allowAngularStylePrecedenceDuplicates: false,
  ignore: [],
};

export default createESLintRule<Options, MessageIds>({
  name: RULE_NAME,
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensures that there are no duplicate input properties or output event listeners',
      recommended: false,
    },
    hasSuggestions: true,
    schema: [
      {
        type: 'object',
        properties: {
          allowTwoWayDataBinding: {
            type: 'boolean',
            default: DEFAULT_OPTIONS.allowTwoWayDataBinding,
            description: `Whether or not two-way data binding is allowed as an exception to the rule.`,
          },
          allowAngularStylePrecedenceDuplicates: {
            type: 'boolean',
            default: DEFAULT_OPTIONS.allowAngularStylePrecedenceDuplicates,
            description: `Whether or not angular style precedence is allowed as an exception to the rule.`,
          },
          ignore: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
            default: DEFAULT_OPTIONS.ignore,
            description: `Input or output properties for which duplicate presence is allowed as an exception to the rule.`,
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noDuplicateAttributes: 'Duplicate attribute `{{attributeName}}`',
      suggestRemoveAttribute: 'Remove attribute `{{attributeName}}`',
    },
  },
  defaultOptions: [DEFAULT_OPTIONS],
  create(
    context,
    [{ allowTwoWayDataBinding, allowAngularStylePrecedenceDuplicates, ignore }],
  ) {
    const parserServices = getTemplateParserServices(context);

    return {
      Element$1({ inputs, outputs, attributes }: TmplAstElement) {
        // According to the Angular documentation (https://angular.io/guide/style-precedence#style-precedence)
        // Angular merges both attributes which means their combined use is valid
        const angularStylePrecedenceDuplicatesAllowed = ['class', 'style'];

        let duplicateInputsAndAttributes = findDuplicates([
          ...inputs,
          ...attributes,
        ]);

        if (allowAngularStylePrecedenceDuplicates) {
          const inputsIgnored = inputs.filter((input) =>
            angularStylePrecedenceDuplicatesAllowed.includes(
              getOriginalAttributeName(input),
            ),
          );

          if (inputsIgnored?.length > 0) {
            const attributesIgnored = attributes.filter((attr) =>
              angularStylePrecedenceDuplicatesAllowed.includes(
                getOriginalAttributeName(attr),
              ),
            );
            const inputsNotIgnored = inputs.filter(
              (input) => !inputsIgnored.includes(input),
            );
            const attributesNotIgnored = attributes.filter(
              (attr) => !attributesIgnored.includes(attr),
            );
            const ignoreDuplicated = [
              ...findDuplicates(inputsIgnored),
              ...findDuplicates(attributesIgnored),
            ];
            const notIgnoredDuplicates = [
              ...findDuplicates(inputsNotIgnored),
              ...findDuplicates(attributesNotIgnored),
            ];
            duplicateInputsAndAttributes = [
              ...ignoreDuplicated,
              ...notIgnoredDuplicates,
            ];
          }
        }

        const filteredOutputs = allowTwoWayDataBinding
          ? outputs.filter((output) => {
              return !inputs.some(
                (input) =>
                  input.sourceSpan.start === output.sourceSpan.start &&
                  input.sourceSpan.end === output.sourceSpan.end,
              );
            })
          : outputs;
        const duplicateOutputs = findDuplicates(filteredOutputs);
        const allDuplicates = [
          ...duplicateInputsAndAttributes,
          ...duplicateOutputs,
        ] as const;

        const filteredDuplicates =
          ignore && ignore.length > 0
            ? allDuplicates.filter(
                (duplicate) =>
                  !ignore.includes(getOriginalAttributeName(duplicate)),
              )
            : allDuplicates;

        filteredDuplicates.forEach((duplicate) => {
          const loc = parserServices.convertNodeSourceSpanToLoc(
            duplicate.sourceSpan,
          );
          const data = {
            attributeName: getOriginalAttributeName(duplicate),
          } as const;

          context.report({
            loc,
            messageId: 'noDuplicateAttributes',
            data,
            suggest: [
              {
                messageId: 'suggestRemoveAttribute',
                fix: (fixer) =>
                  fixer.removeRange([loc.start.column, loc.end.column + 1]),
                data,
              },
            ],
          });
        });
      },
    };
  },
});

function findDuplicates<
  TAttributeType extends
    | TmplAstBoundEvent
    | TmplAstBoundAttribute
    | TmplAstTextAttribute,
>(elements: readonly TAttributeType[]): readonly TAttributeType[] {
  return elements.filter((element) => {
    return elements.some(
      (otherElement) =>
        otherElement !== element &&
        getOriginalAttributeName(otherElement) ===
          getOriginalAttributeName(element),
    );
  });
}

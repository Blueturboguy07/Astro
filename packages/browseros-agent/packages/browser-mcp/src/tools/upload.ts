import { z } from 'zod'
import { defineTool, errorResult, textResult } from './framework'
import { resolveUploadPaths } from './upload-paths'

export const upload = defineTool({
  name: 'upload',
  description:
    'Set local file path(s) on a file input using a ref from the last snapshot. Use for <input type="file"> upload flows. Give full paths ("~/" is expanded); a missing or empty file is refused.',
  input: z.object({
    page: z.number().int().describe('Page id from `tabs`.'),
    ref: z
      .string()
      .describe('Ref of the <input type="file"> element, e.g. "e12".'),
    file: z.string().optional().describe('Single local file path to upload.'),
    files: z
      .array(z.string())
      .optional()
      .describe('Local file paths to upload.'),
  }),
  annotations: {
    title: 'Upload file to page',
    destructiveHint: true,
  },
  handler: async (args, ctx) => {
    const files = args.files ?? (args.file === undefined ? [] : [args.file])
    if (files.length === 0) {
      return errorResult('upload: provide file or files[].')
    }

    const resolved = resolveUploadPaths(files)
    if ('error' in resolved) return errorResult(resolved.error)

    await ctx.session.input(args.page).uploadFile(args.ref, resolved.paths)
    return textResult(`Uploaded ${files.length} file(s) to ${args.ref}`, {
      page: args.page,
      ref: args.ref,
      files: resolved.paths,
      uploaded: files.length,
    })
  },
})

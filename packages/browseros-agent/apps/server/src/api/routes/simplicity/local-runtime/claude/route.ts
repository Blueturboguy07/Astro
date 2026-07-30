import {
  findClaudeBinary,
  verifyClaudeCode,
} from '../../../../../lib/simplicity/models/providers/claudecode/claudeCodeLLM';

/* Health check for the "connect your Claude account" path.
 *
 * GET  — is the CLI installed? Cheap, so the UI can label the button.
 * POST — is it actually usable? Runs one trivial prompt, because an installed
 *        but signed-out Claude Code is indistinguishable from a working one
 *        until a real query fails. Connecting without this check reports
 *        success and then breaks on the user's first search.
 */

export const GET = async () => {
  const binary = findClaudeBinary();
  return Response.json({ installed: !!binary, path: binary }, { status: 200 });
};

export const POST = async () => {
  const binary = findClaudeBinary();

  if (!binary) {
    return Response.json(
      {
        message:
          'Claude Code was not found. Install it from claude.com/claude-code, sign in, then try again.',
      },
      { status: 400 },
    );
  }

  const result = await verifyClaudeCode(binary);

  if (!result.ok) {
    return Response.json({ message: result.message }, { status: 400 });
  }

  return Response.json({ ok: true, path: binary }, { status: 200 });
};

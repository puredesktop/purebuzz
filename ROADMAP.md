# purebuzz roadmap

## Scope

Keep relay-based team messaging over the existing Buzz/Nostr protocol, with current membership and approval boundaries.

These are proposed, incremental improvements, not a release schedule or a list of missing core features. Keep each change small and preserve existing file formats, user data and app workflows.

## Improvements

1. **Relay address validation.** Give immediate, field-level feedback for malformed relay addresses and show an example WebSocket URL before attempting a connection.

2. **Connection status detail.** Expand the connection indicator with the current relay host and last connection error, without exposing credentials or private keys.

3. **Reconnect without losing text.** Keep the current composer text and attachment selections visible during a brief reconnect, and clearly distinguish disconnected from still sending.

4. **Explain relay capability errors.** Translate unsupported search, upload or invitation responses into action-specific messages that say which relay feature is unavailable.

5. **Conversation draft indicators.** Mark conversations with retained unsent text in the sidebar, building on the existing per-conversation drafts so users can find unfinished messages.

6. **Failed-send recovery.** Keep failed message text available with an explicit retry action and a clear pending state; never resend automatically after an ambiguous acknowledgement.

7. **Long-message wrapping.** Wrap long URLs and unbroken strings inside message bubbles so they cannot force the conversation wider than the app window.

8. **Exact message timestamps.** Expose the full date, time and timezone on timestamp focus or hover while retaining the compact timestamp in the stream.

9. **Copy message text.** Offer a message action that copies its plain text and confirms success without including interface labels or hidden metadata.

10. **Search result context.** Include the conversation name, author and exact timestamp in each search result to make similar matches easier to distinguish.

11. **Highlight search matches.** Emphasize the literal matched text in message search results without modifying the stored message or interpreting search text as markup.

12. **Search empty-state guidance.** Distinguish no matches from a failed or unsupported relay search and offer a clear action to reset the query.

13. **Attachment size labels.** Show filenames, file types and human-readable sizes on attachment previews before upload and in the conversation stream when metadata is available.

14. **Attachment failure feedback.** Identify which selected attachment failed and retain the other selections, allowing the user to remove or retry that file explicitly.

15. **Invitation expiry labels.** Show both the relative expiry and exact expiration time for generated invitations using the existing validity value.

16. **Reliable invitation copy feedback.** Show the existing copied confirmation only after clipboard writing succeeds, and provide an actionable message if clipboard access fails.

17. **Clarify membership restrictions.** Explain disabled channel actions in terms of the current membership or relay response instead of leaving an unexplained inactive control.

18. **Member list filtering.** Add a local name or public-key filter to the existing members panel, with a visible match count and a reset action.

19. **Reply preview truncation.** Limit quoted reply previews to a few readable lines and provide an expand action without hiding the author or changing the reply target.

20. **Conversation menu keyboard polish.** Make Escape close the menu, return focus to its trigger and keep all available actions reachable with the keyboard.

## References

- [App guide](docs/app-guide.md)
- [Development guide](docs/development.md)
- [Current implementation](src/App.tsx)

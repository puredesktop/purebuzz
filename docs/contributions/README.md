# purebuzz contribution roadmap

[View roadmap issues](https://github.com/puredesktop/purebuzz/issues?q=is%3Aissue%20label%3Aroadmap)

Build something you can see and try in the app. The first five items are **good first contributions**: bounded changes with a concrete demonstration. Choose a feature below, fix a bug, or propose your own improvement.

## Scope

Keep relay-based team messaging over the existing Buzz/Nostr protocol, with current membership and approval boundaries.

Size describes scope, not a promised completion time: **Small** = one focused interface change; **Medium** = coordinated interface/state work; **Large** = a feature across several flows, storage or export paths. All items are proposals, not claims that existing features are absent. Check the current code and extend what is there. Maintainers review code and tests before merging. Attribution is your choice.

## Good first contributions

1. **[Find conversations with unfinished messages.](https://github.com/puredesktop/purebuzz/issues/2)** Mark conversations with retained unsent text in the sidebar, building on the existing per-conversation drafts so users can find unfinished messages.
   <!-- contribution: {"id": "conversation-draft-indicators", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/conversation-draft-indicators.md"} -->
   [Small · Good first contribution · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/conversation-draft-indicators.md)

2. **[Copy a message in one click.](https://github.com/puredesktop/purebuzz/issues/3)** Offer a message action that copies its plain text and confirms success without including interface labels or hidden metadata.
   <!-- contribution: {"id": "copy-message-text", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/copy-message-text.md"} -->
   [Small · Good first contribution · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/copy-message-text.md)

3. **[See the exact time a message was sent.](https://github.com/puredesktop/purebuzz/issues/4)** Expose the full date, time and timezone on timestamp focus or hover while retaining the compact timestamp in the stream.
   <!-- contribution: {"id": "exact-message-timestamps", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/exact-message-timestamps.md"} -->
   [Small · Good first contribution · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/exact-message-timestamps.md)

4. **[See attachment sizes before sending.](https://github.com/puredesktop/purebuzz/issues/5)** Show filenames, file types and human-readable sizes on attachment previews before upload and in the conversation stream when metadata is available.
   <!-- contribution: {"id": "attachment-size-labels", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/attachment-size-labels.md"} -->
   [Small · Good first contribution · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/attachment-size-labels.md)

5. **[Find a person in the member list.](https://github.com/puredesktop/purebuzz/issues/6)** Add a local name or public-key filter to the existing members panel, with a visible match count and a reset action.
   <!-- contribution: {"id": "member-list-filtering", "size": "small", "goodFirstIssue": true, "guide": "docs/contributions/member-list-filtering.md"} -->
   [Small · Good first contribution · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/member-list-filtering.md)

## More improvements

6. **[Check a relay address before connecting.](https://github.com/puredesktop/purebuzz/issues/7)** Give immediate, field-level feedback for malformed relay addresses and show an example WebSocket URL before attempting a connection.
   <!-- contribution: {"id": "relay-address-validation", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/relay-address-validation.md"} -->
   [Small · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/relay-address-validation.md)

7. **[See which relay is connected.](https://github.com/puredesktop/purebuzz/issues/8)** Expand the connection indicator with the current relay host and last connection error, without exposing credentials or private keys.
   <!-- contribution: {"id": "connection-status-detail", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/connection-status-detail.md"} -->
   [Small · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/connection-status-detail.md)

8. **[Keep your message when the connection drops.](https://github.com/puredesktop/purebuzz/issues/9)** Keep the current composer text and attachment selections visible during a brief reconnect, and clearly distinguish disconnected from still sending.
   <!-- contribution: {"id": "reconnect-without-losing-text", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/reconnect-without-losing-text.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/reconnect-without-losing-text.md)

9. **[Understand unavailable relay features.](https://github.com/puredesktop/purebuzz/issues/10)** Translate unsupported search, upload or invitation responses into action-specific messages that say which relay feature is unavailable.
   <!-- contribution: {"id": "explain-relay-capability-errors", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/explain-relay-capability-errors.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/explain-relay-capability-errors.md)

10. **[Retry a failed message deliberately.](https://github.com/puredesktop/purebuzz/issues/11)** Keep failed message text available with an explicit retry action and a clear pending state; never resend automatically after an ambiguous acknowledgement.
   <!-- contribution: {"id": "failed-send-recovery", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/failed-send-recovery.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/failed-send-recovery.md)

11. **[Read long links without horizontal scrolling.](https://github.com/puredesktop/purebuzz/issues/12)** Wrap long URLs and unbroken strings inside message bubbles so they cannot force the conversation wider than the app window.
   <!-- contribution: {"id": "long-message-wrapping", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/long-message-wrapping.md"} -->
   [Small · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/long-message-wrapping.md)

12. **[Recognise messages in search results.](https://github.com/puredesktop/purebuzz/issues/13)** Include the conversation name, author and exact timestamp in each search result to make similar matches easier to distinguish.
   <!-- contribution: {"id": "search-result-context", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/search-result-context.md"} -->
   [Small · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/search-result-context.md)

13. **[See matching words in search results.](https://github.com/puredesktop/purebuzz/issues/14)** Emphasize the literal matched text in message search results without modifying the stored message or interpreting search text as markup.
   <!-- contribution: {"id": "highlight-search-matches", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/highlight-search-matches.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/highlight-search-matches.md)

14. **[Recover from an empty or failed search.](https://github.com/puredesktop/purebuzz/issues/15)** Distinguish no matches from a failed or unsupported relay search and offer a clear action to reset the query.
   <!-- contribution: {"id": "search-empty-state-guidance", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/search-empty-state-guidance.md"} -->
   [Small · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/search-empty-state-guidance.md)

15. **[Retry just the attachment that failed.](https://github.com/puredesktop/purebuzz/issues/16)** Identify which selected attachment failed and retain the other selections, allowing the user to remove or retry that file explicitly.
   <!-- contribution: {"id": "attachment-failure-feedback", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/attachment-failure-feedback.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/attachment-failure-feedback.md)

16. **[See when an invitation expires.](https://github.com/puredesktop/purebuzz/issues/17)** Show both the relative expiry and exact expiration time for generated invitations using the existing validity value.
   <!-- contribution: {"id": "invitation-expiry-labels", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/invitation-expiry-labels.md"} -->
   [Small · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/invitation-expiry-labels.md)

17. **[Know when an invitation was copied.](https://github.com/puredesktop/purebuzz/issues/18)** Show the existing copied confirmation only after clipboard writing succeeds, and provide an actionable message if clipboard access fails.
   <!-- contribution: {"id": "reliable-invitation-copy-feedback", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/reliable-invitation-copy-feedback.md"} -->
   [Small · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/reliable-invitation-copy-feedback.md)

18. **[Understand restricted channel actions.](https://github.com/puredesktop/purebuzz/issues/19)** Explain disabled channel actions in terms of the current membership or relay response instead of leaving an unexplained inactive control.
   <!-- contribution: {"id": "clarify-membership-restrictions", "size": "small", "goodFirstIssue": false, "guide": "docs/contributions/clarify-membership-restrictions.md"} -->
   [Small · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/clarify-membership-restrictions.md)

19. **[Expand a long quoted reply.](https://github.com/puredesktop/purebuzz/issues/20)** Limit quoted reply previews to a few readable lines and provide an expand action without hiding the author or changing the reply target.
   <!-- contribution: {"id": "reply-preview-truncation", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/reply-preview-truncation.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/reply-preview-truncation.md)

20. **[Use conversation menus with the keyboard.](https://github.com/puredesktop/purebuzz/issues/21)** Make Escape close the menu, return focus to its trigger and keep all available actions reachable with the keyboard.
   <!-- contribution: {"id": "conversation-menu-keyboard-polish", "size": "medium", "goodFirstIssue": false, "guide": "docs/contributions/conversation-menu-keyboard-polish.md"} -->
   [Medium · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/conversation-menu-keyboard-polish.md)

21. **[Browse shared files in a conversation.](https://github.com/puredesktop/purebuzz/issues/22)** Add a conversation files view that lists attachments already present in loaded messages, with filename search and jump-to-message. Show the loaded-history scope rather than claiming all relay history.
   <!-- contribution: {"id": "browse-shared-files-in-a-conversation", "size": "large", "goodFirstIssue": false, "guide": "docs/contributions/browse-shared-files-in-a-conversation.md"} -->
   [Large · Implementation brief](https://github.com/puredesktop/purebuzz/blob/main/docs/contributions/browse-shared-files-in-a-conversation.md)

## References

- [App guide](https://github.com/puredesktop/purebuzz/blob/main/docs/app-guide.md)
- [Development guide](https://github.com/puredesktop/purebuzz/blob/main/docs/development.md)
- [Contributing](https://github.com/puredesktop/purebuzz/blob/main/CONTRIBUTING.md)

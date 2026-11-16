# TV mode

TV mode is a full-screen, game-styled layout for driving agents from across the room, on a large monitor or a TV. It is built for a wireless keyboard and mouse, or for a gamepad mapped to keys plus speech-to-text software that types for you. It works on web and desktop, locally or over a remote connection, and it follows your current theme.

TV mode covers working with active threads, starting threads, and watching usage. Everything else, such as settings and adding projects, stays in the normal layout.

## Start and exit

Open `/tv` on the device you want to use, or choose **Enter TV mode** in the command palette. TV mode is saved per device, so turning it on for the TV does not change your laptop.

Press `Q` in the hub, or choose **Exit TV mode** in the command palette, to return to the normal layout.

## The hub

The hub shows one ring of thread cards at a time. Rings are stacked: by project to begin with, or by status (Pinned, Waiting on you, Failed, Working, Idle) after you press `G`. Threads waiting on you come first, and the project with the most urgent thread is shown first. The top left corner names the current ring and the ones above and below it. Your remaining subscription limits are in the top right corner.

| Key       | In the hub                                       |
| --------- | ------------------------------------------------ |
| `←` `→`   | Move between threads                             |
| `↑` `↓`   | Move to the ring above or below                  |
| `Enter`   | Open the thread                                  |
| `G`       | Switch between grouping by project and by status |
| `N`       | Start a thread                                   |
| `P`       | Pin or unpin the thread                          |
| `S`       | Settle the thread                                |
| `U`       | Open Usage                                       |
| `H`       | Show or hide the key hints                       |
| `+` / `-` | Make everything larger or smaller                |
| `F`       | Toggle full screen                               |
| `Q`       | Exit TV mode                                     |

In a project ring, `N` starts the thread in that project. In a status ring, it starts it in the project of the selected thread.

Settling or unpinning shows an **Undo** notice. A settled thread leaves the hub; find it again in the normal layout.

With a mouse, click a card to select it and click it again to open it. The scroll wheel moves between threads, and the names in the top left corner move between rings.

## In a thread

A thread opens in a window with the normal conversation and composer, so messages, diffs, approvals, and attachments behave as they do elsewhere. The composer has focus when a thread opens, so typed or dictated text lands there.

Navigation keys only act while you are not in a text field, so dictated text is never read as a command. `Escape` leaves the text field, and anything you type afterward still goes to the composer.

| Key      | In a thread, outside a text field                    |
| -------- | ---------------------------------------------------- |
| `Escape` | Return to the hub                                    |
| `[` `]`  | Swap to the previous or next thread of the same ring |
| `Tab`    | List the tables, images, and PDFs on screen          |

Click the project name in the top left corner to return to the hub with a mouse.

## Tables, images, and PDFs

Press `Tab` to list the tables, images, and PDF links currently on screen in the thread. Scroll the conversation first if the one you want is further up.

| Key      | With the list open                                  |
| -------- | --------------------------------------------------- |
| `↑` `↓`  | Pick an item, or scroll the item once it is open    |
| `Enter`  | Open the item in front of the thread                |
| `←` `→`  | Move to the previous or next item while one is open |
| `Escape` | Close the item, then the list                       |

## Using a gamepad

TV mode does not read a controller itself. Use a mapping app to send keys: the D-pad as the arrow keys, and buttons for `Enter`, `Escape`, `Tab`, `[`, `]`, `N`, and `G`. That set reaches every thread and item. `P`, `S`, `U`, and `H` are worth a button if you have spares.

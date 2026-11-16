# TV mode

TV mode is a full-screen, game-styled layout for driving agents from across the room, on a large monitor or a TV. It is built for a wireless keyboard and mouse, or for a gamepad mapped to keys plus speech-to-text software that types for you. It works on web and desktop, locally or over a remote connection, and it follows your current theme.

TV mode covers working with active threads, starting threads, and watching usage. Everything else, such as settings and adding projects, stays in the normal layout.

## Start and exit

Open `/tv` on the device you want to use, or choose **Enter TV mode** in the command palette. TV mode is saved per device, so turning it on for the TV does not change your laptop.

Press `Q` in the hub, or choose **Exit TV mode** in the command palette, to return to the normal layout.

## The hub

The hub shows one project at a time as a ring of its active threads. Threads waiting on you (approvals, questions, failures) come first, and the project with the most urgent thread is shown first. Your remaining subscription limits are in the top right corner.

| Key       | In the hub                          |
| --------- | ----------------------------------- |
| `←` `→`   | Move between threads                |
| `↑` `↓`   | Move between projects               |
| `Enter`   | Open the thread                     |
| `N`       | Start a thread in the project shown |
| `U`       | Open Usage                          |
| `H`       | Show or hide the key hints          |
| `+` / `-` | Make everything larger or smaller   |
| `F`       | Toggle full screen                  |
| `Q`       | Exit TV mode                        |

With a mouse, click a card to select it and click it again to open it. The scroll wheel moves between threads.

## In a thread

A thread opens in a window with the normal conversation and composer, so messages, diffs, approvals, and attachments behave as they do elsewhere. The composer has focus when a thread opens, so typed or dictated text lands there.

Navigation keys only act while you are not in a text field, so dictated text is never read as a command. `Escape` leaves the text field, and anything you type afterward still goes to the composer.

| Key      | In a thread, outside a text field                       |
| -------- | ------------------------------------------------------- |
| `Escape` | Return to the hub                                       |
| `[` `]`  | Swap to the previous or next thread of the same project |
| `Tab`    | List the tables, images, and PDFs on screen             |

Click the project name in the top left corner to return to the hub with a mouse.

## Tables, images, and PDFs

Press `Tab` to list the tables, images, and PDF links currently on screen in the thread. Scroll the conversation first if the one you want is further up.

| Key      | With the list open                                  |
| -------- | --------------------------------------------------- |
| `↑` `↓`  | Pick an item, or scroll the item once it is open    |
| `Enter`  | Open the item in its own window                     |
| `←` `→`  | Move to the previous or next item while one is open |
| `Escape` | Close the item, then the list                       |

## Using a gamepad

TV mode does not read a controller itself. Use a mapping app to send keys: the D-pad as the arrow keys, and buttons for `Enter`, `Escape`, `Tab`, `[`, `]`, `N`, `U`, and `H`. That set reaches every part of TV mode.

# Discovery vectors

These `.http` files are HTTP request/response fixtures testing the discovery handshake. Each file documents one scenario: the request the agent makes, the response the publisher gives, and the expected agent behavior. They are NOT executed by Plan 1's runner. Plan 2 (reference server) and Plans 3/4 (SDKs) consume these vectors as test inputs when they implement the handshake.

Format: each file contains one or more HTTP request/response pairs separated by `###`, JetBrains/VSCode REST Client style. Comments at the top of each file describe the scenario and the expected outcome.

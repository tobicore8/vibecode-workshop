# The idea

Draft by the project lead. The team still has to agree on it. Items marked **(decide)** need a human answer.

- **Assigned idea:** Picnic Planner. Organise a picnic with a shared checklist so everyone knows what to bring.
- **Who has the problem?** One organiser inviting about 4–15 friends. Today the list lives in a group chat, so people bring three bags of crisps, nobody brings cups, and the organiser keeps asking "who's bringing what?"
- **What can they do by the end of the demo?** The organiser creates a picnic with a list of things needed and shares one link. Each guest opens the link, types their name and claims what they'll bring. Everyone can see what is still unclaimed.
- **What one task proves it helped?** A guest opens the shared link on their phone, sees an unclaimed item, claims it under their name, and a second person who opens the link afterwards sees that claim.
- **What constraints matter today?**
  - One workshop day, so the journey has to work on a phone.
  - No accounts, logins or email. The link is the access and the name is just typed in.
  - Claims must be shared on the server. Browser storage doesn't count.
  - Data lives outside the release folders, under `~/.local/share/vibecode-workshop/data/`, so it survives deploys and restarts.
- **What are we deliberately leaving for later?** Weather, maps, RSVPs, budgets or splitting costs, recipes, dietary tags, notifications, live updates without reload, editing permissions, multiple organisers, deleting picnics.
- **What remains an assumption that we need to test?**
  - People will use a link instead of just replying in the group chat. This is the big one.
  - Typing a name is enough identity, and nobody will mess with other people's claims.
  - One person per item is enough. Whether quantities matter ("3 × blankets") is **(decide)**.
  - Whether guests can add items, or only the organiser can, is **(decide)**.

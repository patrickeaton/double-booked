# Double Booked: the fortnight

A 14-day probation, starting on a Wednesday. Weekdays are light on pre-booked meetings and heavy on things that come in during the day. Weekends have no calendar to plan, only your phone pinging.

Hand-written beats live in `src/days.ts`. Everything else comes from the seeded ad-hoc pool in `src/adhoc.ts`: requests, errands, dilemmas, calls, venue changes, remote/in-person flips and pushed meetings. Retrying a day replays the same draw.

## The threads

| Thread | Question | Pays off |
|---|---|---|
| **Kestrel Ventures** | Will they invest before the money runs out? | Day 14: funded if you held the partner meeting (Day 10) and standing is 50+ |
| **The board / Gerald** | Does Margo stay CEO? | Day 12 call → Day 13 vote |
| **Theo & Leafly** | Is Theo leaving? | Day 7 email → Day 12 offer → Day 13 |
| **Sam's "restructuring"** | Are there layoffs? | Tied to Kestrel on Day 14 |
| **Jules** | Can you keep a life? | Day 10 birthday → Day 11 aftermath |
| **You** | Do you pass probation? | Day 14 review: 60+ hired, 40+ extended, below 40 let go |

## Day by day

| # | Day | Title | Unlocks | Beats |
|---|---|---|---|---|
| 1 | Wed | Welcome to Sproutly | Calendar, Huddle, Notes, Brew | Kestrel intro call; Tobias wants the deck; Gerald asks for "15 mins" |
| 2 | Thu | Two Bosses | Mail, Messages | Theo joins (focus block); pricing chat; dentist overrun; Jules dinner |
| 3 | Fri | Thank-You Notes | Bundl, Card, Presto | Finance: about 16 days of money left; Kestrel gift; Theo mentions Leafly; drinks vs. Jules |
| 4 | Sat | Saturday (Allegedly) | — | Margo's "zero pressure" Zoom deck review |
| 5 | Sun | Sunday Scaries | — | **Gerald wants a secret call** (keep quiet / tell Margo) |
| 6 | Mon | On the Road | Ryde | Off-site day; **Gerald: "How's Margo, really?"**; Margo asks if you told her |
| 7 | Tue | Table for Three | Tably | Dinner with Tobias; **Leafly email meant for Theo** (tell Margo / talk to Theo / delete) |
| 8 | Wed | Hump Day | — | Board meeting set ("Leadership"); **Sam's "Restructuring" 1:1**; Margo spirals → board prep |
| 9 | Thu | Fire Drill | — | Kestrel due diligence vs. servers down; Theo's interview (cover?); Wren wobbles if morale is low |
| 10 | Fri | The Squeeze | — | **Kestrel partners visit** (strike if missed); Jules' birthday at Lucca's vs. board call running late |
| 11 | Sat | The Morning After | — | Kestrel's verdict on Friday; Jules' reaction; Margo can't sleep |
| 12 | Sun | Quiet Before | — | **Gerald: what do I tell the board?** (back Margo / she needs a COO / Theo should run it); Theo's Leafly offer |
| 13 | Mon | Board Day | — | Theo may quit; **board vote result**; Q3 numbers for Kestrel |
| 14 | Tue | Review Day | — | **Kestrel decides**; layoffs or not; your review at 5pm |

After Day 14 (or straight from the title screen) comes **Endless mode**: every app unlocked, no story, and weekdays get busier every couple of days.

## Flags that matter

`kestrel-met` · `funded` · `backed-margo` / `honest-gerald` / `theo-ceo` · `margo-ousted` · `theo-talk` / `leafly-told` · `theo-stays` / `theo-leaves` · `missed-birthday` / `went-birthday` / `apologized` · `lied-to-sam` · `wren-quits` · `leafly-you`

Scripts can depend on flags or a meter: `when: { if: [...], unless: [...], meter: { m, min, max } }`.

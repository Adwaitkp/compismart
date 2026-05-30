import instaloader
import json
import sys
import re

url = sys.argv[1]

# Extract shortcode from URL (handles both /reel/ and /reels/)
match = re.search(r'/reels?/([^/?]+)', url)
if not match:
    print(json.dumps({"views": 0, "followers": 0}))
    sys.exit(0)

shortcode = match.group(1)
L = instaloader.Instaloader()

try:
    post = instaloader.Post.from_shortcode(L.context, shortcode)
    
    views = post.video_view_count if post.is_video else 0
    followers = post.owner_profile.followers
    
    print(json.dumps({
        "views": views if views else 0,
        "followers": followers if followers else 0
    }))
except Exception as e:
    # Agar kuch bhi error aaye toh 0 return karo
    print(json.dumps({"views": 0, "followers": 0}))

import React from 'react';
import { Box, Typography, Link } from '@mui/material';
import { Email } from '@mui/icons-material';

export default function Footer() {
    const contactEmail = 'gradeview@lists.berkeley.edu';

    return (
        <Box
            component="footer"
            sx={{
                flex: '0 0 auto',
                py: 2,
                px: 2,
                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                borderTop: '1px solid rgba(0, 0, 0, 0.12)',
                textAlign: 'center',
                width: '100%',
                zIndex: 1,
            }}
        >
            <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    flexWrap: 'wrap',
                }}
            >
                <Email sx={{ fontSize: 16 }} />
                <span>Questions or issues?</span>
                <Link
                    href={`mailto:${contactEmail}`}
                    color="primary"
                    underline="hover"
                    sx={{ fontWeight: 500 }}
                >
                    {contactEmail}
                </Link>
            </Typography>
        </Box>
    );
}


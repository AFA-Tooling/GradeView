import React, { useCallback, useState } from 'react';
import { Alert, Button, Box, Typography } from '@mui/material';
import { CloudUpload } from '@mui/icons-material';
import Grid from '@mui/material/Grid2';
import { styled } from '@mui/material/styles';

import PageHeader from '../components/PageHeader';
import apiv2 from '../utils/apiv2';

const VisuallyHiddenInput = styled('input')({
    clip: 'rect(0 0 0 0)',
    clipPath: 'inset(50%)',
    height: 1,
    overflow: 'hidden',
    position: 'absolute',
    bottom: 0,
    left: 0,
    whiteSpace: 'nowrap',
    width: 1,
});

export default function Admin() {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState();
    const [uploadSuccessMessage, setUploadSuccessMessage] = useState();

    const handleUpload = useCallback(async (file) => {
        if (isUploading || !file) return;
        setIsUploading(true);
        setError();
        setUploadSuccessMessage();

        const formData = new FormData();
        formData.append('schema', file);

        try {
            await apiv2.post('/admin/progressreports', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                }
            });
            setUploadSuccessMessage('Schema uploaded successfully');
        } catch (err) {
            setError(err.message);
        } finally {
            setIsUploading(false);
        }
    }, [isUploading]);

    return (
        // TODO: make the grid item a separate component.
        <>
            <PageHeader>Admin</PageHeader>
            <Box pl={10} pr={10}>
                <Grid
                    container
                    spacing={2}
                    columns={4}
                    alignItems='center'
                >
                    <Grid
                        size={1}
                        border={1}
                        borderColor='grey.300'
                        borderRadius={1}
                        p={4}
                        display='flex'
                        flexDirection='column'
                        gap={2}
                    >
                        <Typography variant='h6' textAlign='center'>Upload Concept Map Schema File</Typography>
                        <Button
                            component="label"
                            role={undefined}
                            variant='contained'
                            tabIndex={-1}
                            startIcon={<CloudUpload />}
                        >
                            Upload schema
                            <VisuallyHiddenInput
                                type="file"
                                accept=".cm"
                                onChange={(e) => {
                                    handleUpload(e.target.files[0]);
                                }}
                            />
                        </Button>
                        {error && <Alert severity='error'>{error}</Alert>}
                        {uploadSuccessMessage && <Alert severity='success'>{uploadSuccessMessage}</Alert>}
                    </Grid>
                </Grid>
            </Box>
        </>
    );
}
